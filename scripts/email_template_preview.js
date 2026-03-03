const data = {
  metrics: {
    totalSignups: 505,
    activeCliniciansCount: 35,
    totalPatients: 435,
    wau: 2,
    mau: 9,
    conversionRate: 20.00,
    arpu: 350.00,
    currentMonthRev: 35.00,
    revChangePct: -39.7,
    avgSessionsPerClinician: 17.77,
    avgPatientsPerClinician: 12.43,
    longitudinalPct: 34.9,
    medianTTV: 2.4,
    medianTTP: 363.0
  },
  outcomes: {
    proms: {
      painChange: 0.68,
      activityChange: -0.19,
      painDistribution: { positive: '54.8', neutral: '16.1', negative: '29.0' },
      activityDistribution: { positive: '29.0', neutral: '38.7', negative: '32.3' }
    }
  }
};

const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Benchmark Weekly Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; padding: 20px; color: #111827; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background-color: #4f46e5; padding: 30px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Benchmark Weekly Update</h1>
      <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">${date}</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      
      <p style="margin-top: 0; font-size: 16px; line-height: 1.5; color: #4b5563;">
        Here is the latest data on platform growth, clinical engagement, and patient outcomes over the past 7 days.
      </p>

      <!-- Section: Growth & Revenue -->
      <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; margin-top: 30px;">Growth & Revenue</h2>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr>
          <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 50%; border: 2px solid white;">
            <div style="font-size: 12px; color: #6b7280; font-weight: 600;">Current Month Revenue</div>
            <div style="font-size: 24px; font-weight: 700; color: #111827; margin-top: 5px;">$${data.metrics.currentMonthRev}</div>
            <div style="font-size: 12px; color: #ef4444; margin-top: 2px;">↓ 39.7% MoM</div>
          </td>
          <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 50%; border: 2px solid white;">
            <div style="font-size: 12px; color: #6b7280; font-weight: 600;">ARPU (Paid Users)</div>
            <div style="font-size: 24px; font-weight: 700; color: #111827; margin-top: 5px;">$${data.metrics.arpu}</div>
            <div style="font-size: 12px; color: #10b981; margin-top: 2px;">20.0% Conv. Rate</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 50%; border: 2px solid white;">
            <div style="font-size: 12px; color: #6b7280; font-weight: 600;">Active Clinicians</div>
            <div style="font-size: 24px; font-weight: 700; color: #111827; margin-top: 5px;">${data.metrics.activeCliniciansCount}</div>
            <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">${data.metrics.wau} WAU / ${data.metrics.mau} MAU</div>
          </td>
          <td style="padding: 15px; background: #f9fafb; border-radius: 8px; width: 50%; border: 2px solid white;">
            <div style="font-size: 12px; color: #6b7280; font-weight: 600;">Total Patients</div>
            <div style="font-size: 24px; font-weight: 700; color: #111827; margin-top: 5px;">${data.metrics.totalPatients}</div>
            <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">${data.metrics.avgPatientsPerClinician} per clinician</div>
          </td>
        </tr>
      </table>

      <!-- Section: Engagement -->
      <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; margin-top: 30px;">Engagement & Stickiness</h2>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr>
          <td style="padding: 15px 0; border-bottom: 1px solid #f3f4f6;">
            <strong>Time to Test (Median)</strong>
          </td>
          <td style="padding: 15px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">
            ${data.metrics.medianTTV} Days
          </td>
        </tr>
        <tr>
          <td style="padding: 15px 0; border-bottom: 1px solid #f3f4f6;">
            <strong>Test Sessions / Clinician</strong>
          </td>
          <td style="padding: 15px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">
            ${data.metrics.avgSessionsPerClinician}
          </td>
        </tr>
        <tr>
          <td style="padding: 15px 0; border-bottom: 1px solid #f3f4f6;">
            <strong>Longitudinal Data Rate</strong>
          </td>
          <td style="padding: 15px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">
            ${data.metrics.longitudinalPct}%
          </td>
        </tr>
      </table>

      <!-- Section: Outcomes -->
      <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; margin-top: 30px;">Clinical Outcomes (PROMs)</h2>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 5px;">Based on longitudinal patients (6wk - 5mo treatment window).</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr>
          <td style="padding: 15px; background: #eef2ff; border-radius: 8px; width: 50%; border: 2px solid white;">
            <div style="font-size: 12px; color: #4f46e5; font-weight: 600;">Pain Score Improvement</div>
            <div style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 5px;">↑ ${data.outcomes.proms.painDistribution.positive}%</div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Flat: ${data.outcomes.proms.painDistribution.neutral}% | Worse: ${data.outcomes.proms.painDistribution.negative}%</div>
          </td>
          <td style="padding: 15px; background: #eef2ff; border-radius: 8px; width: 50%; border: 2px solid white;">
            <div style="font-size: 12px; color: #4f46e5; font-weight: 600;">Activity Rating Improvement</div>
            <div style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 5px;">↑ ${data.outcomes.proms.activityDistribution.positive}%</div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Flat: ${data.outcomes.proms.activityDistribution.neutral}% | Worse: ${data.outcomes.proms.activityDistribution.negative}%</div>
          </td>
        </tr>
      </table>

      <!-- Footer CTA -->
      <div style="margin-top: 40px; text-align: center;">
        <a href="https://benchmark-investor-dashboard-xxx.onrender.com" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">View Live Dashboard</a>
      </div>

    </div>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    This is an automated report generated by the Benchmark AI Agent.<br/>
    Test accounts and @benchmarkps.org emails are excluded from this data.
  </div>
</body>
</html>
`;

console.log(emailHTML);
