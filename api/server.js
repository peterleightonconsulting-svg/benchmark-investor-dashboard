const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());

const port = process.env.PORT || 3001;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Database Schema Context for the AI
const schemaContext = `
You are a read-only database assistant for the Benchmark clinical platform.
Your job is to translate user questions into valid MySQL queries, run them, and summarize the results.

Here is the database schema:
- users (id, first_name, last_name, email, is_practitioner, subscribed_status, s_transactionId, is_test_account)
- patients (id, doctor_id, first_name, last_name, gender, activity_level)
- patient_test_sessions (id, patient_id, test_date, created_at)
- patient_test_records (id, patient_test_session_id, test_id, left, right, no_laterality)
- test_list (id, name, test_category_id, body_part_id)
- test_category (id, name)
- body_parts (id, name)
- transactions (id, user_id, amount, status, created_at)
- patient_symptoms_form (id, patient_id, created_at, pain_intensity, activity_rating)

CRITICAL RULES:
1. You must ONLY output a valid SQL SELECT query in your first response block wrapped in \`\`\`sql ... \`\`\` tags.
2. NEVER write UPDATE, DELETE, INSERT, DROP, or ALTER queries.
3. Always exclude test accounts by adding 'is_test_account = 0 AND email NOT LIKE "%@benchmarkps.org"' when querying the users table.
4. Try to join tables to give human-readable names (like joining patients to users to get the doctor's name).
`;

// AI Chat Route
app.post('/api/chat', express.json(), async (req, res) => {
  let connection;
  try {
    const userQuestion = req.body.question;
    if (!userQuestion) return res.status(400).json({ error: "Question is required" });

    // Step 1: Ask Gemini to generate the SQL query
    const prompt = `${schemaContext}\n\nUser Question: "${userQuestion}"\nGenerate the MySQL SELECT query:`;
    const sqlResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    let generatedSQL = sqlResponse.text;
    
    // Extract SQL from markdown blocks if present
    const sqlMatch = generatedSQL.match(/```sql\n([\s\S]*?)\n```/);
    if (sqlMatch) generatedSQL = sqlMatch[1].trim();
    else generatedSQL = generatedSQL.trim();

    // Security Check: Ensure it's a read-only SELECT query
    if (!generatedSQL.toLowerCase().startsWith('select')) {
      return res.status(400).json({ error: "Only SELECT queries are allowed for security reasons.", generatedSQL });
    }
    if (/(update|delete|insert|drop|alter|truncate|replace)/i.test(generatedSQL)) {
      return res.status(400).json({ error: "Malicious query detected. Only read operations are permitted." });
    }

    // Step 2: Execute the Query
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3307,
      user: process.env.DB_USER || 'benchmark2026',
      password: process.env.DB_PASSWORD || 'Benchmark941!!',
      database: process.env.DB_NAME || 'benchmark-mysql',
      ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : null
    });

    const [rows] = await connection.query(generatedSQL);

    // Step 3: Ask Gemini to summarize the results
    const summaryPrompt = `
      The user asked: "${userQuestion}"
      The database returned this JSON result: ${JSON.stringify(rows).substring(0, 2000)}
      Please provide a friendly, concise, natural language answer to the user's question based on this data.
    `;
    
    const summaryResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: summaryPrompt
    });

    res.json({
      answer: summaryResponse.text,
      sql: generatedSQL,
      rawData: rows
    });

  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: error.message, details: "The AI might have generated an invalid SQL query or the database connection failed." });
  } finally {
    if (connection) await connection.end();
  }
});

// Helper to calculate weeks between dates
function getWeeksBetween(d1, d2) {
  return Math.abs(d2 - d1) / (1000 * 60 * 60 * 24 * 7);
}

// API Route
app.get('/api/stats', async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3307,
      user: process.env.DB_USER || 'benchmark2026',
      password: process.env.DB_PASSWORD || 'Benchmark941!!',
      database: process.env.DB_NAME || 'benchmark-mysql',
      ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : null
    });

    async function queryVal(sql) {
      const [rows] = await connection.query(sql);
      return rows[0] ? Object.values(rows[0])[0] : 0;
    }

    // Exclusion condition reused across queries
    const excludeCondition = "users.is_test_account = 0 AND users.email NOT LIKE '%@benchmarkps.org'";

    // Adoption & Growth (Excluding test accounts and staff)
    const totalSignups = await queryVal(`SELECT COUNT(*) FROM users WHERE is_test_account = 0 AND email NOT LIKE '%@benchmarkps.org'`);
    const activeCliniciansCount = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const paidClinicians = await queryVal(`SELECT COUNT(*) FROM users WHERE (subscribed_status = 1 OR s_transactionId IS NOT NULL) AND is_test_account = 0 AND email NOT LIKE '%@benchmarkps.org'`);
    const wau = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 7 DAY AND ${excludeCondition}`);
    const mau = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 30 DAY AND ${excludeCondition}`);
    const [userGrowth] = await connection.query(`SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count FROM users WHERE is_test_account = 0 AND email NOT LIKE '%@benchmarkps.org' GROUP BY month ORDER BY month DESC LIMIT 6`);

    const conversionRate = activeCliniciansCount > 0 ? ((paidClinicians / activeCliniciansCount) * 100).toFixed(2) : 0;
    
    // Revenue & ARPU
    const [totalTrans] = await connection.query("SELECT SUM(amount) as total FROM transactions");
    const totalRevenue = totalTrans[0].total || 0;
    const arpu = paidClinicians > 0 ? (totalRevenue / paidClinicians).toFixed(2) : 0;

    // Monthly Revenue Comparison
    const [currentMonthRevQuery] = await connection.query("SELECT SUM(amount) as total FROM transactions WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");
    const currentMonthRev = currentMonthRevQuery[0].total || 0;

    const [previousMonthRevQuery] = await connection.query("SELECT SUM(amount) as total FROM transactions WHERE created_at >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-01') AND created_at < DATE_FORMAT(NOW(), '%Y-%m-01')");
    const previousMonthRev = previousMonthRevQuery[0].total || 0;
    
    let revChangePct = 0;
    if (previousMonthRev > 0) {
      revChangePct = (((currentMonthRev - previousMonthRev) / previousMonthRev) * 100).toFixed(1);
    } else if (currentMonthRev > 0) {
      revChangePct = 100; // 100% growth if previous month was 0
    }

    // Usage & Engagement (Excluding test accounts via doctor_id)
    const totalSessions = await queryVal(`SELECT COUNT(*) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const totalPatients = await queryVal(`SELECT COUNT(*) FROM patients JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const avgSessionsPerClinician = activeCliniciansCount > 0 ? (totalSessions / activeCliniciansCount).toFixed(2) : 0;
    const avgPatientsPerClinician = activeCliniciansCount > 0 ? (totalPatients / activeCliniciansCount).toFixed(2) : 0;

    const [testTypes] = await connection.query(`SELECT tc.name as name, COUNT(ptr.id) as value FROM patient_test_records ptr JOIN test_list tl ON ptr.test_id = tl.id JOIN test_category tc ON tl.test_category_id = tc.id JOIN patient_test_sessions pts ON ptr.patient_test_session_id = pts.id JOIN patients p ON pts.patient_id = p.id JOIN users u ON p.doctor_id = u.id WHERE u.is_test_account = 0 AND u.email NOT LIKE '%@benchmarkps.org' GROUP BY tc.name`);

    const [longitudinalData] = await connection.query(`SELECT COUNT(*) as count FROM (SELECT pts.patient_id, COUNT(*) as sessions FROM patient_test_sessions pts JOIN patients p ON pts.patient_id = p.id JOIN users u ON p.doctor_id = u.id WHERE u.is_test_account = 0 AND u.email NOT LIKE '%@benchmarkps.org' GROUP BY pts.patient_id HAVING sessions >= 2) as sub`);
    const patientsWithMultipleSessions = longitudinalData[0].count;
    const longitudinalPct = totalPatients > 0 ? ((patientsWithMultipleSessions / totalPatients) * 100).toFixed(1) : 0;

    // --- Updated Physical Improvements Logic ---
    const [testRecords] = await connection.query(`
      SELECT 
        pts.patient_id, pts.test_date, ptr.test_id, 
        tl.name AS test_name, tc.name AS category_name, bp.name AS body_part_name,
        ptr.left, ptr.right, ptr.no_laterality,
        i.injured_limb
      FROM patient_test_records ptr
      JOIN patient_test_sessions pts ON ptr.patient_test_session_id = pts.id
      JOIN patients p ON pts.patient_id = p.id
      JOIN users u ON p.doctor_id = u.id
      JOIN test_list tl ON ptr.test_id = tl.id
      JOIN test_category tc ON tl.test_category_id = tc.id
      LEFT JOIN body_parts bp ON tl.body_part_id = bp.id
      LEFT JOIN injury i ON pts.patient_id = i.patient_id
      WHERE u.is_test_account = 0 AND u.email NOT LIKE '%@benchmarkps.org'
      ORDER BY pts.patient_id, ptr.test_id, pts.test_date ASC
    `);

    const patientTests = {};
    for (const row of testRecords) {
      const fullTestName = (row.body_part_name ? row.body_part_name + " " : "") + row.test_name;
      const key = row.patient_id + "_" + row.test_id;
      if (!patientTests[key]) patientTests[key] = { test_name: fullTestName, category: row.category_name, records: [], injured_limb: row.injured_limb };
      patientTests[key].records.push(row);
    }

    const testImprovements = {};
    for (const key in patientTests) {
      const data = patientTests[key];
      if (data.records.length > 1) {
        const first = data.records[0];
        const last = data.records[data.records.length - 1];
        const weeks = getWeeksBetween(new Date(first.test_date), new Date(last.test_date)) || 1;
        
        if (!testImprovements[data.test_name]) {
          testImprovements[data.test_name] = { category: data.category, injuredChanges: [], uninjuredChanges: [], noLatChanges: [] };
        }

        // Reclassify Left/Right based on Injured Limb
        const injured = (data.injured_limb || "").toLowerCase();
        
        // Handle Left Side
        if (first.left !== null && last.left !== null) {
          const changePerWeek = (last.left - first.left) / weeks;
          if (injured.includes("left")) testImprovements[data.test_name].injuredChanges.push(changePerWeek);
          else if (injured.includes("right")) testImprovements[data.test_name].uninjuredChanges.push(changePerWeek);
        }

        // Handle Right Side
        if (first.right !== null && last.right !== null) {
          const changePerWeek = (last.right - first.right) / weeks;
          if (injured.includes("right")) testImprovements[data.test_name].injuredChanges.push(changePerWeek);
          else if (injured.includes("left")) testImprovements[data.test_name].uninjuredChanges.push(changePerWeek);
        }

        if (first.no_laterality !== null && last.no_laterality !== null) {
          testImprovements[data.test_name].noLatChanges.push((last.no_laterality - first.no_laterality) / weeks);
        }
      }
    }

    const improvementsData = [];
    for (const testName in testImprovements) {
      const data = testImprovements[testName];
      const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
      const n = Math.max(data.injuredChanges.length, data.uninjuredChanges.length, data.noLatChanges.length);
      if (n >= 1) { // Showing all for now to verify logic
        improvementsData.push({
          testName,
          category: data.category,
          patients: n,
          injuredAvg: avg(data.injuredChanges),
          uninjuredAvg: avg(data.uninjuredChanges),
          noLatAvg: avg(data.noLatChanges)
        });
      }
    }
    improvementsData.sort((a, b) => b.patients - a.patients);

    // --- Updated PROMs Logic (6wk to 5mo filter) ---
    const [promsRecords] = await connection.query(`
      SELECT psf.patient_id, psf.created_at, psf.pain_intensity, psf.activity_rating 
      FROM patient_symptoms_form psf
      JOIN patients p ON psf.patient_id = p.id
      JOIN users u ON p.doctor_id = u.id
      WHERE u.is_test_account = 0 AND u.email NOT LIKE '%@benchmarkps.org'
      ORDER BY psf.patient_id, psf.created_at ASC
    `);
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
        const weeks = getWeeksBetween(new Date(first.created_at), new Date(last.created_at));
        
        // Applying the rule: 6 weeks to 5 months (approx 21.7 weeks)
        if (weeks >= 6 && weeks <= 21.7) {
          if (first.pain_intensity !== null && last.pain_intensity !== null) {
            painChanges.push(last.pain_intensity - first.pain_intensity);
          }
          if (first.activity_rating !== null && last.activity_rating !== null) {
            activityChanges.push(last.activity_rating - first.activity_rating);
          }
        }
      }
    }

    const calcDistribution = (arr) => {
      if (!arr.length) return { positive: 0, neutral: 0, negative: 0 };
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

    const promsData = {
      patients: Math.max(painChanges.length, activityChanges.length),
      painChange: painChanges.length ? (painChanges.reduce((a, b) => a + b, 0) / painChanges.length).toFixed(2) : 0,
      activityChange: activityChanges.length ? (activityChanges.reduce((a, b) => a + b, 0) / activityChanges.length).toFixed(2) : 0,
      painDistribution: calcDistribution(painChanges),
      activityDistribution: calcDistribution(activityChanges)
    };

    res.json({
      metrics: { totalSignups, activeCliniciansCount, totalPatients, wau, mau, conversionRate, arpu, currentMonthRev, revChangePct, avgSessionsPerClinician, avgPatientsPerClinician, longitudinalPct },
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

const distPath = path.join(__dirname, '..', 'ui', 'dist');
app.use(express.static(distPath));
app.use((req, res) => { res.sendFile(path.join(distPath, 'index.html')); });

app.listen(port, () => { console.log(`Server is running on port ${port}`); });
