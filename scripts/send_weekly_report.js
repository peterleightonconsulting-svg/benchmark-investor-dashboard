const { Resend } = require('resend');
const mysql = require('mysql2/promise');

async function sendWeeklyReport() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3307,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : null
    });

    async function queryVal(sql) {
      const [rows] = await connection.query(sql);
      return rows[0] ? Object.values(rows[0])[0] : 0;
    }

    const excludeCondition = "users.is_test_account = 0 AND users.email NOT LIKE '%@benchmarkps.org'";

    // --- 1. Weekly Velocity ---
    const weeklyClinicians = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 7 DAY AND ${excludeCondition}`);
    const weeklyPatients = await queryVal(`SELECT COUNT(DISTINCT patient_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 7 DAY AND ${excludeCondition}`);
    const weeklyRev = await queryVal(`SELECT SUM(amount) FROM transactions WHERE created_at >= NOW() - INTERVAL 7 DAY`);

    // --- 2. Platform Totals ---
    const totalClinicians = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const totalPatients = await queryVal(`SELECT COUNT(*) FROM patients JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const totalRev = await queryVal(`SELECT SUM(amount) FROM transactions`);
    const paidClinicians = await queryVal(`SELECT COUNT(*) FROM users WHERE (subscribed_status = 1 OR s_transactionId IS NOT NULL) AND is_test_account = 0 AND email NOT LIKE '%@benchmarkps.org'`);

    // --- 3. Engagement & Outcomes ---
    const totalSessions = await queryVal(`SELECT COUNT(*) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const avgSessionsPerClinician = totalClinicians > 0 ? (totalSessions / totalClinicians).toFixed(2) : 0;
    
    // TTV
    const [ttvRows] = await connection.query(`SELECT MIN(DATEDIFF(pts.created_at, u.created_at)) as days FROM users u JOIN patients p ON u.id = p.doctor_id JOIN patient_test_sessions pts ON p.id = pts.patient_id WHERE ${excludeCondition} GROUP BY u.id`);
    let ttvDays = ttvRows.map(r => r.days).filter(d => d >= 0).sort((a, b) => a - b);
    let medianTTV = ttvDays.length > 0 ? ttvDays[Math.floor(ttvDays.length / 2)] : 0;

    // Longitudinal
    const [longData] = await connection.query(`SELECT COUNT(*) as count FROM (SELECT pts.patient_id, COUNT(*) as sessions FROM patient_test_sessions pts JOIN patients p ON pts.patient_id = p.id JOIN users u ON p.doctor_id = u.id WHERE ${excludeCondition} GROUP BY pts.patient_id HAVING sessions >= 2) as sub`);
    const longitudinalPct = totalPatients > 0 ? ((longData[0].count / totalPatients) * 100).toFixed(1) : 0;

    // PROMs (6wk-5mo)
    const [promsRows] = await connection.query(`SELECT psf.patient_id, psf.created_at, psf.pain_intensity FROM patient_symptoms_form psf JOIN patients p ON psf.patient_id = p.id JOIN users u ON p.doctor_id = u.id WHERE ${excludeCondition} ORDER BY psf.patient_id, psf.created_at ASC`);
    const patientProms = {};
    promsRows.forEach(r => { if(!patientProms[r.patient_id]) patientProms[r.patient_id] = []; patientProms[r.patient_id].push(r); });
    let painPos = 0, painTotal = 0, painSum = 0;
    for (const id in patientProms) {
      const recs = patientProms[id];
      if (recs.length > 1) {
        const weeks = (new Date(recs[recs.length-1].created_at) - new Date(recs[0].created_at)) / (1000*60*60*24*7);
        if (weeks >= 6 && weeks <= 21.7) {
          const diff = recs[recs.length-1].pain_intensity - recs[0].pain_intensity;
          if (diff > 0) painPos++;
          painTotal++;
          painSum += diff;
        }
      }
    }
    const painPct = painTotal > 0 ? ((painPos / painTotal) * 100).toFixed(1) : 0;
    const painAvg = painTotal > 0 ? (painSum / painTotal).toFixed(2) : 0;

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; background-color: #f3f4f6; padding: 20px; color: #111827;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="background: #4f46e5; padding: 30px; text-align: center; color: #fff;">
          <h1 style="margin: 0; font-size: 24px;">Benchmark Weekly Update</h1>
          <p style="margin: 5px 0 0; opacity: 0.8;">${dateStr}</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="font-size: 14px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; margin-top: 0;">Weekly Velocity (Past 7 Days)</h2>
          <table style="width: 100%; margin: 15px 0 30px;">
            <tr>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600;">ACTIVE CLINICIANS</div>
                <div style="font-size: 22px; font-weight: 700;">${weeklyClinicians}</div>
              </td>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600;">PATIENTS TREATED</div>
                <div style="font-size: 22px; font-weight: 700;">${weeklyPatients}</div>
              </td>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600;">WEEKLY REVENUE</div>
                <div style="font-size: 22px; font-weight: 700;">$${weeklyRev || 0}</div>
              </td>
            </tr>
          </table>

          <h2 style="font-size: 14px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">Platform Totals (All Time)</h2>
          <table style="width: 100%; margin: 15px 0 30px;">
            <tr>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600;">TOTAL CLINICIANS</div>
                <div style="font-size: 22px; font-weight: 700;">${totalClinicians}</div>
              </td>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600;">TOTAL PATIENTS</div>
                <div style="font-size: 22px; font-weight: 700;">${totalPatients}</div>
              </td>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600;">TOTAL REVENUE</div>
                <div style="font-size: 22px; font-weight: 700;">$${totalRev || 0}</div>
              </td>
            </tr>
          </table>

          <h2 style="font-size: 14px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">Clinical Proof</h2>
          <div style="padding: 15px; background: #f0fdf4; border-radius: 8px; margin-top: 15px; text-align: center;">
            <div style="font-size: 11px; color: #166534; font-weight: 600;">PAIN SCORE IMPROVEMENT RATE</div>
            <div style="font-size: 24px; font-weight: 700;">↑ ${painPct}%</div>
            <div style="font-size: 12px; color: #166534; margin-top: 5px;">Average Raw Change: +${painAvg}</div>
          </div>

          <div style="margin-top: 40px; text-align: center;">
            <a href="https://benchmark-invest-dashboard.onrender.com" style="background: #4f46e5; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">Open Full Investor Dashboard</a>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: 'Benchmark Reports <reports@resend.dev>',
      to: process.env.COFOUNDER_EMAILS.split(','),
      subject: `Benchmark Weekly Update: ${dateStr}`,
      html: html,
    });

    if (error) console.error('Error sending email:', error);
    else console.log('Weekly report sent successfully!', emailData.id);

  } catch (err) {
    console.error('Script failed:', err);
  } finally {
    if (connection) await connection.end();
  }
}

sendWeeklyReport();
