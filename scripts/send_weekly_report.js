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

    // --- 1. Weekly Velocity (This Week vs Last Week) ---
    const [thisWkClin] = await connection.query(`SELECT COUNT(DISTINCT patients.doctor_id) as c FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 7 DAY AND ${excludeCondition}`);
    const [lastWkClin] = await connection.query(`SELECT COUNT(DISTINCT patients.doctor_id) as c FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 14 DAY AND patient_test_sessions.created_at < NOW() - INTERVAL 7 DAY AND ${excludeCondition}`);
    
    const [thisWkPat] = await connection.query(`SELECT COUNT(DISTINCT patient_id) as c FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 7 DAY AND ${excludeCondition}`);
    const [lastWkPat] = await connection.query(`SELECT COUNT(DISTINCT patient_id) as c FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 14 DAY AND patient_test_sessions.created_at < NOW() - INTERVAL 7 DAY AND ${excludeCondition}`);
    
    const [thisWkRev] = await connection.query(`SELECT SUM(amount) as t FROM transactions WHERE created_at >= NOW() - INTERVAL 7 DAY`);
    const [lastWkRev] = await connection.query(`SELECT SUM(amount) as t FROM transactions WHERE created_at >= NOW() - INTERVAL 14 DAY AND created_at < NOW() - INTERVAL 7 DAY`);

    const weeklyClinicians = thisWkClin[0].c;
    const weeklyPatients = thisWkPat[0].c;
    const weeklyRev = thisWkRev[0].t || 0;

    const calcTrend = (now, past) => {
      if (past === 0) return now > 0 ? { dir: '↑', val: '100%', col: '#10b981' } : { dir: '—', val: '0%', col: '#6b7280' };
      const pct = ((now - past) / past) * 100;
      if (pct > 0) return { dir: '↑', val: `+${pct.toFixed(1)}%`, col: '#10b981' };
      if (pct < 0) return { dir: '↓', val: `${pct.toFixed(1)}%`, col: '#ef4444' };
      return { dir: '—', val: '0%', col: '#6b7280' };
    };

    const clinTrend = calcTrend(weeklyClinicians, lastWkClin[0].c);
    const patTrend = calcTrend(weeklyPatients, lastWkPat[0].c);
    const revTrend = calcTrend(weeklyRev, lastWkRev[0].t || 0);

    // --- 2. Platform Totals (Must have >= 1 test) ---
    const totalClinicians = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const totalPatients = await queryVal(`SELECT COUNT(DISTINCT patient_test_sessions.patient_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const totalRev = await queryVal(`SELECT SUM(amount) FROM transactions`);

    // --- 3. Engagement & Outcomes ---
    const totalSessions = await queryVal(`SELECT COUNT(*) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const avgSessionsPerClinician = totalClinicians > 0 ? (totalSessions / totalClinicians).toFixed(2) : 0;
    
    const [ttvRows] = await connection.query(`SELECT MIN(DATEDIFF(pts.created_at, u.created_at)) as days FROM users u JOIN patients p ON u.id = p.doctor_id JOIN patient_test_sessions pts ON p.id = pts.patient_id WHERE ${excludeCondition} GROUP BY u.id`);
    let ttvDays = ttvRows.map(r => r.days).filter(d => d >= 0).sort((a, b) => a - b);
    let medianTTV = ttvDays.length > 0 ? ttvDays[Math.floor(ttvDays.length / 2)] : 0;

    const [longData] = await connection.query(`SELECT COUNT(*) as count FROM (SELECT pts.patient_id, COUNT(*) as sessions FROM patient_test_sessions pts JOIN patients p ON pts.patient_id = p.id JOIN users u ON p.doctor_id = u.id WHERE ${excludeCondition} GROUP BY pts.patient_id HAVING sessions >= 2) as sub`);
    const longitudinalPct = totalPatients > 0 ? ((longData[0].count / totalPatients) * 100).toFixed(1) : 0;

    // PROMs (6wk-5mo, strictly matching website: positive = better)
    const [promsRecords] = await connection.query(`SELECT psf.patient_id, psf.created_at, psf.pain_intensity, psf.activity_rating FROM patient_symptoms_form psf JOIN patients p ON psf.patient_id = p.id JOIN users u ON p.doctor_id = u.id WHERE ${excludeCondition} ORDER BY psf.patient_id, psf.created_at ASC`);
    const patientProms = {};
    for (const row of promsRecords) {
      if (!patientProms[row.patient_id]) patientProms[row.patient_id] = [];
      patientProms[row.patient_id].push(row);
    }
    
    const painChanges = [];
    const activityChanges = [];
    for (const patientId in patientProms) {
      const records = patientProms[patientId];
      if (records.length > 1) {
        const first = records[0];
        const last = records[records.length - 1];
        const weeks = Math.abs(new Date(last.created_at) - new Date(first.created_at)) / (1000 * 60 * 60 * 24 * 7);
        if (weeks >= 6 && weeks <= 21.7) {
          if (first.pain_intensity !== null && last.pain_intensity !== null) {
            painChanges.push(last.pain_intensity - first.pain_intensity); // Reduced pain = positive number
          }
          if (first.activity_rating !== null && last.activity_rating !== null) {
            activityChanges.push(last.activity_rating - first.activity_rating); // Increased activity = positive number
          }
        }
      }
    }

    const calcDistribution = (arr) => {
      if (!arr.length) return { positive: '0.0', neutral: '0.0', negative: '0.0' };
      let pos = 0, neu = 0, neg = 0;
      arr.forEach(val => {
        if (val > 0) pos++;
        else if (val < 0) neg++;
        else neu++;
      });
      return {
        positive: ((pos / arr.length) * 100).toFixed(1),
        neutral: ((neu / arr.length) * 100).toFixed(1),
        negative: ((neg / arr.length) * 100).toFixed(1)
      };
    };

    const painDist = calcDistribution(painChanges);
    const actDist = calcDistribution(activityChanges);
    const painAvg = painChanges.length ? (painChanges.reduce((a, b) => a + b, 0) / painChanges.length).toFixed(2) : 0;
    const actAvg = activityChanges.length ? (activityChanges.reduce((a, b) => a + b, 0) / activityChanges.length).toFixed(2) : 0;

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; padding: 20px; color: #111827; margin: 0;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="background-color: #4f46e5; padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Benchmark Weekly Update</h1>
          <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">${dateStr}</p>
        </div>
        <div style="padding: 30px 20px;">
          
          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; margin-top: 0;">Weekly Velocity (Past 7 Days)</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px;">
            <tr>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600; text-transform: uppercase;">Active Clinicians</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${weeklyClinicians}</div>
                <div style="font-size: 11px; color: ${clinTrend.col}; margin-top: 4px; font-weight: 600;">${clinTrend.dir} ${clinTrend.val}</div>
              </td>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600; text-transform: uppercase;">Patients Treated</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${weeklyPatients}</div>
                <div style="font-size: 11px; color: ${patTrend.col}; margin-top: 4px; font-weight: 600;">${patTrend.dir} ${patTrend.val}</div>
              </td>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600; text-transform: uppercase;">Weekly Revenue</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">$${weeklyRev}</div>
                <div style="font-size: 11px; color: ${revTrend.col}; margin-top: 4px; font-weight: 600;">${revTrend.dir} ${revTrend.val}</div>
              </td>
            </tr>
          </table>

          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">Platform Totals (All Time)</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px;">
            <tr>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Total Clinicians</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${totalClinicians}</div>
              </td>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Total Patients</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${totalPatients}</div>
              </td>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Total Revenue</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">$${totalRev || 0}</div>
              </td>
            </tr>
          </table>

          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">Product Stickiness (Cumulative)</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong>Median Time to First Test</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">${medianTTV} Days</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong>Avg Test Sessions / Clinician</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">${avgSessionsPerClinician}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong>Longitudinal Retention Rate</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">${longitudinalPct}%</td>
            </tr>
          </table>

          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">Clinical Outcomes (Total Proof)</h2>
          <p style="font-size: 11px; color: #9ca3af; margin-top: 5px;">Based on patients with a 6-week to 5-month treatment cycle.</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
              <td style="padding: 15px; background: #f0fdf4; border-radius: 8px; width: 50%; border: 2px solid white;">
                <div style="font-size: 11px; color: #166534; font-weight: 600; text-transform: uppercase;">Avg Pain Score Change</div>
                <div style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 5px;">${painAvg > 0 ? '+' : ''}${painAvg}</div>
                <div style="font-size: 10px; color: #166534; margin-top: 4px;">${painDist.positive}% Improved | ${painDist.negative}% Worsened</div>
              </td>
              <td style="padding: 15px; background: #f0fdf4; border-radius: 8px; width: 50%; border: 2px solid white;">
                <div style="font-size: 11px; color: #166534; font-weight: 600; text-transform: uppercase;">Avg Activity Score Change</div>
                <div style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 5px;">${actAvg > 0 ? '+' : ''}${actAvg}</div>
                <div style="font-size: 10px; color: #166534; margin-top: 4px;">${actDist.positive}% Improved | ${actDist.negative}% Worsened</div>
              </td>
            </tr>
          </table>

          <div style="margin-top: 40px; text-align: center;">
            <a href="https://benchmark-investor-dashboard.onrender.com" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Open Full Investor Dashboard</a>
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
