const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
app.use(cors());

// Use environment variables for port and database
const port = process.env.PORT || 3001;

app.get('/api/stats', async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3307,
      user: process.env.DB_USER || 'benchmark2026',
      password: process.env.DB_PASSWORD || 'Benchmark941!!',
      database: process.env.DB_NAME || 'benchmark-mysql'
    });

    async function queryVal(sql) {
      const [rows] = await connection.query(sql);
      return rows[0] ? Object.values(rows[0])[0] : 0;
    }

    // Adoption & Growth
    const totalSignups = await queryVal("SELECT COUNT(*) FROM users");
    const activeCliniciansCount = await queryVal("SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id");
    const paidClinicians = await queryVal("SELECT COUNT(*) FROM users WHERE subscribed_status = 1 OR s_transactionId IS NOT NULL");
    const wau = await queryVal("SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 7 DAY");
    const mau = await queryVal("SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 30 DAY");
    const [userGrowth] = await connection.query("SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count FROM users GROUP BY month ORDER BY month DESC LIMIT 6");

    // Conversion & Monetisation
    const conversionRate = activeCliniciansCount > 0 ? ((paidClinicians / activeCliniciansCount) * 100).toFixed(2) : 0;
    const [arpuRows] = await connection.query("SELECT AVG(amount) as avg_rev FROM subscription_plans");
    const arpu = arpuRows[0].avg_rev ? (parseFloat(arpuRows[0].avg_rev) / 100).toFixed(2) : 0;

    // Usage & Engagement
    const totalSessions = await queryVal("SELECT COUNT(*) FROM patient_test_sessions");
    const totalPatients = await queryVal("SELECT COUNT(*) FROM patients");
    const avgSessionsPerClinician = activeCliniciansCount > 0 ? (totalSessions / activeCliniciansCount).toFixed(2) : 0;
    const avgPatientsPerClinician = activeCliniciansCount > 0 ? (totalPatients / activeCliniciansCount).toFixed(2) : 0;

    const [testTypes] = await connection.query("SELECT tc.name as name, COUNT(ptr.id) as value FROM patient_test_records ptr JOIN test_list tl ON ptr.test_id = tl.id JOIN test_category tc ON tl.test_category_id = tc.id GROUP BY tc.name");

    // Clinical Depth
    const [longitudinalData] = await connection.query("SELECT COUNT(*) as count FROM (SELECT patient_id, COUNT(*) as sessions FROM patient_test_sessions GROUP BY patient_id HAVING sessions >= 2) as sub");
    const patientsWithMultipleSessions = longitudinalData[0].count;
    const longitudinalPct = totalPatients > 0 ? ((patientsWithMultipleSessions / totalPatients) * 100).toFixed(1) : 0;

    // Clinical Outcomes
    const [testRecords] = await connection.query("SELECT pts.patient_id, pts.test_date, ptr.test_id, tl.name AS test_name, tc.name AS category_name, ptr.left, ptr.right, ptr.no_laterality FROM patient_test_records ptr JOIN patient_test_sessions pts ON ptr.patient_test_session_id = pts.id JOIN test_list tl ON ptr.test_id = tl.id JOIN test_category tc ON tl.test_category_id = tc.id ORDER BY pts.patient_id, ptr.test_id, pts.test_date ASC");
    const patientTests = {};
    for (const row of testRecords) {
      const key = row.patient_id + "_" + row.test_id;
      if (!patientTests[key]) patientTests[key] = { test_name: row.test_name, category: row.category_name, records: [] };
      patientTests[key].records.push(row);
    }
    const testImprovements = {};
    for (const key in patientTests) {
      const data = patientTests[key];
      if (data.records.length > 1) {
        const first = data.records[0];
        const last = data.records[data.records.length - 1];
        if (!testImprovements[data.test_name]) testImprovements[data.test_name] = { category: data.category, leftChanges: [], rightChanges: [], noLatChanges: [] };
        if (first.left !== null && last.left !== null) testImprovements[data.test_name].leftChanges.push(last.left - first.left);
        if (first.right !== null && last.right !== null) testImprovements[data.test_name].rightChanges.push(last.right - first.right);
        if (first.no_laterality !== null && last.no_laterality !== null) testImprovements[data.test_name].noLatChanges.push(last.no_laterality - first.no_laterality);
      }
    }
    const improvementsData = [];
    for (const testName in testImprovements) {
      const data = testImprovements[testName];
      const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
      const n = Math.max(data.leftChanges.length, data.rightChanges.length, data.noLatChanges.length);
      if (n >= 5) improvementsData.push({ testName, category: data.category, patients: n, leftAvg: avg(data.leftChanges), rightAvg: avg(data.rightChanges), noLatAvg: avg(data.noLatChanges) });
    }
    improvementsData.sort((a, b) => b.patients - a.patients);

    const [promsRecords] = await connection.query("SELECT patient_id, created_at, pain_intensity, activity_rating FROM patient_symptoms_form ORDER BY patient_id, created_at ASC");
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
        if (first.pain_intensity !== null && last.pain_intensity !== null) painChanges.push(last.pain_intensity - first.pain_intensity);
        if (first.activity_rating !== null && last.activity_rating !== null) activityChanges.push(last.activity_rating - first.activity_rating);
      }
    }
    const promsData = { patients: Math.max(painChanges.length, activityChanges.length), painChange: painChanges.length ? (painChanges.reduce((a, b) => a + b, 0) / painChanges.length).toFixed(2) : 0, activityChange: activityChanges.length ? (activityChanges.reduce((a, b) => a + b, 0) / activityChanges.length).toFixed(2) : 0 };

    res.json({
      metrics: { totalSignups, activeCliniciansCount, wau, mau, conversionRate, arpu, avgSessionsPerClinician, avgPatientsPerClinician, longitudinalPct },
      charts: { userGrowth: userGrowth.reverse(), testDomains: testTypes },
      outcomes: { tests: improvementsData, proms: promsData }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) await connection.end();
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../ui/dist')));

// For any other route, serve index.html (client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../ui/dist/index.html'));
});

app.listen(port, () => {
  console.log(`Server running at port ${port}`);
});
