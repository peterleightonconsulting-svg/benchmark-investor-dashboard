const { Resend } = require('resend');

async function sendWeeklyReport() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const dashboardUrl = process.env.DASHBOARD_URL || 'https://benchmark-investor-dashboard.onrender.com';

  try {
    console.log(`Fetching latest stats from ${dashboardUrl}/api/stats...`);
    const response = await fetch(`${dashboardUrl}/api/stats`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }

    const { metrics, outcomes } = await response.json();

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Since the API doesn't currently return "thisWkClin" vs "lastWkClin" for the arrows, 
    // we will use the live dashboard's WAU/MAU and Current Month Revenue for the email.
    
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
          
          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; margin-top: 0;">Current Momentum</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px;">
            <tr>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600; text-transform: uppercase;">Weekly Active (WAU)</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${metrics.wau}</div>
              </td>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600; text-transform: uppercase;">Monthly Active (MAU)</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${metrics.mau}</div>
              </td>
              <td style="padding: 15px; background: #eef2ff; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #4f46e5; font-weight: 600; text-transform: uppercase;">Revenue (This Month)</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">$${metrics.currentMonthRev}</div>
                <div style="font-size: 11px; color: ${metrics.revChangePct >= 0 ? '#10b981' : '#ef4444'}; margin-top: 4px; font-weight: 600;">${metrics.revChangePct >= 0 ? '↑' : '↓'} ${Math.abs(metrics.revChangePct)}% MoM</div>
              </td>
            </tr>
          </table>

          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">Platform Totals (All Time)</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px;">
            <tr>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Total Clinicians</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${metrics.activeCliniciansCount}</div>
              </td>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Total Patients</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${metrics.totalPatients}</div>
              </td>
              <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 33%; border: 2px solid white; text-align: center;">
                <div style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Conversion Rate</div>
                <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 5px;">${metrics.conversionRate}%</div>
              </td>
            </tr>
          </table>

          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">Product Stickiness (Cumulative)</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong>Median Time to First Test</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">${metrics.medianTTV} Days</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong>Avg Test Sessions / Clinician</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">${metrics.avgSessionsPerClinician}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong>Longitudinal Retention Rate</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">${metrics.longitudinalPct}%</td>
            </tr>
          </table>

          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">Clinical Outcomes (Total Proof)</h2>
          <p style="font-size: 11px; color: #9ca3af; margin-top: 5px;">Based on patients with a 6-week to 5-month treatment cycle.</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
              <td style="padding: 15px; background: #f0fdf4; border-radius: 8px; width: 50%; border: 2px solid white;">
                <div style="font-size: 11px; color: #166534; font-weight: 600; text-transform: uppercase;">Avg Pain Score Change</div>
                <div style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 5px;">${outcomes.proms.painChange > 0 ? '+' : ''}${outcomes.proms.painChange}</div>
                <div style="font-size: 10px; color: #166534; margin-top: 4px;">${outcomes.proms.painDistribution.positive}% Improved | ${outcomes.proms.painDistribution.negative}% Worsened</div>
              </td>
              <td style="padding: 15px; background: #f0fdf4; border-radius: 8px; width: 50%; border: 2px solid white;">
                <div style="font-size: 11px; color: #166534; font-weight: 600; text-transform: uppercase;">Avg Activity Score Change</div>
                <div style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 5px;">${outcomes.proms.activityChange > 0 ? '+' : ''}${outcomes.proms.activityChange}</div>
                <div style="font-size: 10px; color: #166534; margin-top: 4px;">${outcomes.proms.activityDistribution.positive}% Improved | ${outcomes.proms.activityDistribution.negative}% Worsened</div>
              </td>
            </tr>
          </table>

          <div style="margin-top: 40px; text-align: center;">
            <a href="${dashboardUrl}" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Open Full Investor Dashboard</a>
          </div>
        </div>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        Automated Benchmark Insights • <a href="#" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a><br/>
        Excludes test accounts and internal staff.
      </div>
    </body>
    </html>
    `;

    console.log('Sending email...');
    const { data: emailData, error } = await resend.emails.send({
      from: 'Benchmark Reports <reports@resend.dev>',
      to: process.env.COFOUNDER_EMAILS.split(','),
      subject: `Benchmark Weekly Update: ${dateStr}`,
      html: html,
    });

    if (error) {
      console.error('Error sending email via Resend:', error);
    } else {
      console.log('Weekly report sent successfully! ID:', emailData.id);
    }

  } catch (err) {
    console.error('Script failed:', err);
  }
}

sendWeeklyReport();