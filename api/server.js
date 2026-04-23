const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
app.use(cors());

const port = process.env.PORT || 3001;

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

// Ping route for health check
app.get('/api/ping', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
      ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : null,
      connectTimeout: 10000
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

// API Route - Get Physiotherapists
app.get('/api/physios', async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3307,
      user: process.env.DB_USER || 'benchmark2026',
      password: process.env.DB_PASSWORD || 'Benchmark941!!',
      database: process.env.DB_NAME || 'benchmark-mysql',
      ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : null,
      connectTimeout: 10000
    });
    const [physios] = await connection.query(`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        COUNT(DISTINCT p.id) as patient_count,
        COUNT(DISTINCT psf.patient_id) as proms_count,
        COUNT(DISTINCT CASE WHEN (
          SELECT DATEDIFF(MAX(created_at), MIN(created_at))
          FROM patient_symptoms_form psf2 
          WHERE psf2.patient_id = p.id
        ) >= 3 THEN p.id ELSE NULL END) as longitudinal_proms_count
      FROM users u
      JOIN patients p ON u.id = p.doctor_id
      LEFT JOIN patient_symptoms_form psf ON p.id = psf.patient_id
      WHERE u.is_test_account = 0 AND u.email NOT LIKE '%@benchmarkps.org'
      GROUP BY u.id
      HAVING patient_count > 0
      ORDER BY u.first_name ASC
    `);
    res.json(physios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) await connection.end();
  }
});

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
      ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : null,
      connectTimeout: 10000
    });

    async function queryVal(sql) {
      const [rows] = await connection.query(sql);
      return rows[0] ? Object.values(rows[0])[0] : 0;
    }

    // Exclusion condition reused across queries
    let excludeCondition = "users.is_test_account = 0 AND users.email NOT LIKE '%@benchmarkps.org' AND users.email NOT LIKE 'gus@%'";
    if (req.query.physioId) {
      excludeCondition += ` AND users.id = ${connection.escape(req.query.physioId)}`;
    }
    
    // Fallback for queries that don't join users table directly but need physio filtering
    let userWhereCondition = "is_test_account = 0 AND email NOT LIKE '%@benchmarkps.org' AND email NOT LIKE 'gus@%'";
    if (req.query.physioId) {
      userWhereCondition += ` AND id = ${connection.escape(req.query.physioId)}`;
    }

    // Alias for 'u' table
    let uExcludeCondition = "u.is_test_account = 0 AND u.email NOT LIKE '%@benchmarkps.org' AND u.email NOT LIKE 'gus@%'";
    if (req.query.physioId) {
      uExcludeCondition += ` AND u.id = ${connection.escape(req.query.physioId)}`;
    }




    // Adoption & Growth (Excluding test accounts and staff)
    const totalSignups = await queryVal(`SELECT COUNT(*) FROM users WHERE ${userWhereCondition}`);
    const activeCliniciansCount = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const paidClinicians = await queryVal(`
      SELECT COUNT(DISTINCT bs.business_id) 
      FROM business_subscriptions bs 
      JOIN subscription_plans sp ON bs.subscription_plan_id = sp.id 
      JOIN businesses b ON bs.business_id = b.id
      JOIN users u ON b.user_id = u.id
      WHERE bs.subscription_status IN ('active', 'trialing') AND sp.amount > 0 AND ${uExcludeCondition}
    `);
    const wau = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 7 DAY AND ${excludeCondition}`);
    const mau = await queryVal(`SELECT COUNT(DISTINCT patients.doctor_id) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE patient_test_sessions.created_at >= NOW() - INTERVAL 30 DAY AND ${excludeCondition}`);
    const [userGrowth] = await connection.query(`SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count FROM users WHERE ${userWhereCondition} GROUP BY month ORDER BY month DESC LIMIT 6`);

    const conversionRate = activeCliniciansCount > 0 ? ((paidClinicians / activeCliniciansCount) * 100).toFixed(2) : 0;
    
    // Revenue & ARPU (Calculated from active subscriptions)
    let subCondition = "bs.subscription_status IN ('active', 'trialing')";
    if (req.query.physioId) {
      subCondition += ` AND bs.business_id = ${connection.escape(req.query.physioId)}`;
    }
    
    const [currentMonthRevQuery] = await connection.query(`
      SELECT SUM(sp.amount) as total 
      FROM business_subscriptions bs
      JOIN subscription_plans sp ON bs.subscription_plan_id = sp.id
      JOIN businesses b ON bs.business_id = b.id
      JOIN users u ON b.user_id = u.id
      WHERE ${subCondition} AND ${uExcludeCondition}
    `);
    const currentMonthRev = (currentMonthRevQuery && currentMonthRevQuery.length > 0) ? (currentMonthRevQuery[0].total || 0) : 0;
    
    // ARPU is MRR divided by paid clinicians
    const arpu = paidClinicians > 0 ? (currentMonthRev / paidClinicians).toFixed(2) : 0;

    // Historical month-over-month calculation disabled; default to 0%
    const revChangePct = 0;

    // Usage & Engagement (Excluding test accounts via doctor_id)
    const totalSessions = await queryVal(`SELECT COUNT(*) FROM patient_test_sessions JOIN patients ON patient_test_sessions.patient_id = patients.id JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const totalPatients = await queryVal(`SELECT COUNT(*) FROM patients JOIN users ON patients.doctor_id = users.id WHERE ${excludeCondition}`);
    const avgSessionsPerClinician = activeCliniciansCount > 0 ? (totalSessions / activeCliniciansCount).toFixed(2) : 0;
    const avgPatientsPerClinician = activeCliniciansCount > 0 ? (totalPatients / activeCliniciansCount).toFixed(2) : 0;

    // Time-To-Value (Median days from signup to first test session)
    const [ttvRows] = await connection.query(`
      SELECT 
        u.id, 
        MIN(DATEDIFF(pts.created_at, u.created_at)) as days_to_first_test
      FROM users u
      JOIN patients p ON u.id = p.doctor_id
      JOIN patient_test_sessions pts ON p.id = pts.patient_id
      WHERE ${uExcludeCondition}
      GROUP BY u.id
    `);
    
    let ttvDays = ttvRows.map(r => r.days_to_first_test).filter(d => d >= 0).sort((a, b) => a - b);
    let medianTTV = 0;
    if (ttvDays.length > 0) {
      const mid = Math.floor(ttvDays.length / 2);
      medianTTV = ttvDays.length % 2 !== 0 ? ttvDays[mid] : (ttvDays[mid - 1] + ttvDays[mid]) / 2;
    }

    // Time-To-Paid (Median days from signup to first payment via business_subscriptions, excluding 28-day trial)
    const [ttpRows] = await connection.query(`
      SELECT 
        u.id, 
        MIN(DATEDIFF(bs.created_at, u.created_at)) as days_to_paid
      FROM users u
      JOIN businesses b ON u.id = b.user_id
      JOIN business_subscriptions bs ON b.id = bs.business_id
      JOIN subscription_plans sp ON bs.subscription_plan_id = sp.id
      WHERE ${uExcludeCondition} AND bs.subscription_status IN ('active', 'trialing') AND sp.amount > 0
      GROUP BY u.id
    `);
    
    let ttpDays = ttpRows.map(r => Math.max(0, r.days_to_paid)).sort((a, b) => a - b);
    let medianTTP = 0;
    if (ttpDays.length > 0) {
      const mid = Math.floor(ttpDays.length / 2);
      medianTTP = ttpDays.length % 2 !== 0 ? ttpDays[mid] : (ttpDays[mid - 1] + ttpDays[mid]) / 2;
    }

    const [testTypes] = await connection.query(`SELECT tc.name as name, COUNT(ptr.id) as value FROM patient_test_records ptr JOIN test_list tl ON ptr.test_id = tl.id JOIN test_category tc ON tl.test_category_id = tc.id JOIN patient_test_sessions pts ON ptr.patient_test_session_id = pts.id JOIN patients p ON pts.patient_id = p.id JOIN users u ON p.doctor_id = u.id WHERE ${uExcludeCondition} GROUP BY tc.name`);

    const [longitudinalData] = await connection.query(`SELECT COUNT(*) as count FROM (SELECT pts.patient_id, COUNT(*) as sessions FROM patient_test_sessions pts JOIN patients p ON pts.patient_id = p.id JOIN users u ON p.doctor_id = u.id WHERE ${uExcludeCondition} GROUP BY pts.patient_id HAVING sessions >= 2) as sub`);
    const patientsWithMultipleSessions = (longitudinalData && longitudinalData.length > 0) ? longitudinalData[0].count : 0;
    const longitudinalPct = totalPatients > 0 ? ((patientsWithMultipleSessions / totalPatients) * 100).toFixed(1) : 0;

    // --- Updated Physical Improvements Logic ---
    const [testRecords] = await connection.query(`
      SELECT 
        pts.patient_id, pts.test_date, ptr.test_id, 
        tl.name AS test_name, tc.name AS category_name, bp.name AS test_body_part_name,
        injury_bp.name AS injury_body_part_name,
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
      LEFT JOIN body_parts injury_bp ON i.body_part_id = injury_bp.id
      WHERE ${uExcludeCondition}
      ORDER BY pts.patient_id, ptr.test_id, pts.test_date ASC
    `);

    const patientTests = {};
    for (const row of testRecords) {
      const fullTestName = (row.test_body_part_name ? row.test_body_part_name + " " : "") + row.test_name;
      const key = row.patient_id + "_" + row.test_id;
      if (!patientTests[key]) patientTests[key] = { test_name: fullTestName, category: row.category_name, records: [], injured_limb: row.injured_limb, injury_body_part_name: row.injury_body_part_name };
      patientTests[key].records.push(row);
    }

    const testImprovements = {};
    const bodyPartMap = {};

    for (const key in patientTests) {
      const data = patientTests[key];
      if (data.records && data.records.length > 1) {
        const first = data.records[0];
        const last = data.records[data.records.length - 1];
        const weeks = getWeeksBetween(new Date(first.test_date), new Date(last.test_date)) || 1;
        
        if (!testImprovements[data.test_name]) {
          testImprovements[data.test_name] = { category: data.category, injuredChanges: [], uninjuredChanges: [], noLatChanges: [], patientIds: new Set() };
        }
        testImprovements[data.test_name].patientIds.add(first.patient_id);

        // Reclassify Left/Right based on Injured Limb
        const injured = (data.injured_limb || "").toLowerCase();
        let changeForBodyPart = null;
        
        // Handle Left Side
        if (first.left !== null && last.left !== null) {
          const changePerWeek = (last.left - first.left) / weeks;
          if (injured.includes("left")) { testImprovements[data.test_name].injuredChanges.push(changePerWeek); changeForBodyPart = changePerWeek; }
          else if (injured.includes("right")) testImprovements[data.test_name].uninjuredChanges.push(changePerWeek);
          else changeForBodyPart = changePerWeek;
        }

        // Handle Right Side
        if (first.right !== null && last.right !== null) {
          const changePerWeek = (last.right - first.right) / weeks;
          if (injured.includes("right")) { testImprovements[data.test_name].injuredChanges.push(changePerWeek); changeForBodyPart = changePerWeek; }
          else if (injured.includes("left")) testImprovements[data.test_name].uninjuredChanges.push(changePerWeek);
          else if (changeForBodyPart === null) changeForBodyPart = changePerWeek;
        }

        if (first.no_laterality !== null && last.no_laterality !== null) {
          const changePerWeek = (last.no_laterality - first.no_laterality) / weeks;
          testImprovements[data.test_name].noLatChanges.push(changePerWeek);
          if (changeForBodyPart === null) changeForBodyPart = changePerWeek;
        }

        if (changeForBodyPart !== null) {
          const bodyPart = data.injury_body_part_name || 'Other';
          if (!bodyPartMap[bodyPart]) {
            bodyPartMap[bodyPart] = { name: bodyPart, patients: new Set(), improvements: [] };
          }
          bodyPartMap[bodyPart].patients.add(first.patient_id);
          bodyPartMap[bodyPart].improvements.push(changeForBodyPart);
        }
      }
    }

    const improvementsData = [];

    for (const testName in testImprovements) {
      const data = testImprovements[testName];
      const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
      const n = Math.max(data.injuredChanges.length, data.uninjuredChanges.length, data.noLatChanges.length);
      
      if (n >= 1) {
        const result = {
          testName,
          category: data.category,
          patients: n,
          injuredAvg: avg(data.injuredChanges),
          uninjuredAvg: avg(data.uninjuredChanges),
          noLatAvg: avg(data.noLatChanges)
        };
        improvementsData.push(result);
      }
    }

    const bodyPartBreakdown = Object.values(bodyPartMap).map(bp => ({
      name: bp.name,
      patientCount: bp.patients.size,
      avgImprovement: bp.improvements.length ? (bp.improvements.reduce((a, b) => a + b, 0) / bp.improvements.length).toFixed(2) : 0
    })).sort((a, b) => b.patientCount - a.patientCount);

    improvementsData.sort((a, b) => b.patients - a.patients);

    // --- Action Needed (Patients due for follow-up > 6 weeks since last session) ---
    const [actionItems] = await connection.query(`
      SELECT p.first_name, p.last_name, MAX(pts.test_date) as last_test, DATEDIFF(NOW(), MAX(pts.test_date)) as days_since
      FROM patients p
      JOIN patient_test_sessions pts ON p.id = pts.patient_id
      JOIN users u ON p.doctor_id = u.id
      WHERE ${uExcludeCondition}
      GROUP BY p.id
      HAVING days_since >= 42 AND days_since < 90
      LIMIT 5
    `);

    // --- Updated PROMs Logic ---
    const [promsRecords] = await connection.query(`
      SELECT psf.patient_id, psf.created_at, psf.pain_intensity, 
             psf.activity_one_result, psf.activity_two_result, psf.activity_three_result
      FROM patient_symptoms_form psf
      JOIN patients p ON psf.patient_id = p.id
      JOIN users u ON p.doctor_id = u.id
      WHERE ${uExcludeCondition}
      ORDER BY psf.patient_id, psf.created_at ASC
    `);
    const patientProms = {};
    for (const row of promsRecords) {
      if (!patientProms[row.patient_id]) patientProms[row.patient_id] = [];
      patientProms[row.patient_id].push(row);
    }
    const painChanges = [];
    const activityChanges = [];
    
    const painChangesPerWeek = [];
    const activityChangesPerWeek = [];

    const getMeanActivity = (record) => {
      const vals = [record.activity_one_result, record.activity_two_result, record.activity_three_result].filter(v => v !== null);
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    let overallImproving = 0;
    let overallMCID = 0;
    let validPromPatients = 0;

    for (const patientId in patientProms) {
      const records = patientProms[patientId];
      if (records && records.length > 1) {
        const first = records[0];
        const last = records[records.length - 1];
        
        const daysDiff = (new Date(last.created_at).getTime() - new Date(first.created_at).getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysDiff >= 3) {
          validPromPatients++;
          const weeks = daysDiff / 7 || 1;
          
          let pChange = null;
          if (first.pain_intensity !== null && last.pain_intensity !== null) {
            pChange = last.pain_intensity - first.pain_intensity;
            painChanges.push(pChange);
            painChangesPerWeek.push(pChange / weeks);
          }
          
          const firstMean = getMeanActivity(first);
          const lastMean = getMeanActivity(last);
          let aChange = null;
          if (firstMean !== null && lastMean !== null) {
            aChange = lastMean - firstMean;
            activityChanges.push(aChange);
            activityChangesPerWeek.push(aChange / weeks);
          }

          // Any improvement
          if ((pChange !== null && pChange > 0) || (aChange !== null && aChange > 0)) {
            overallImproving++;
          }
          
          // MCID (assuming >= 2 points for either pain or function is clinically significant)
          if ((pChange !== null && pChange >= 2) || (aChange !== null && aChange >= 2)) {
            overallMCID++;
          }
        }
      }
    }

    if (painChangesPerWeek.length > 0) {
      improvementsData.push({
        testName: "Pain Score (PROMs)",
        category: "Subjective",
        patients: painChangesPerWeek.length,
        injuredAvg: (painChangesPerWeek.reduce((a, b) => a + b, 0) / painChangesPerWeek.length).toFixed(2),
        uninjuredAvg: null,
        noLatAvg: null
      });
    }
    if (activityChangesPerWeek.length > 0) {
      improvementsData.push({
        testName: "Function Score (PROMs)",
        category: "Subjective",
        patients: activityChangesPerWeek.length,
        injuredAvg: (activityChangesPerWeek.reduce((a, b) => a + b, 0) / activityChangesPerWeek.length).toFixed(2),
        uninjuredAvg: null,
        noLatAvg: null
      });
    }

    improvementsData.sort((a, b) => b.patients - a.patients);

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
      patients: validPromPatients,
      overallImprovingPct: validPromPatients ? ((overallImproving / validPromPatients) * 100).toFixed(0) : 0,
      overallMCIDPct: validPromPatients ? ((overallMCID / validPromPatients) * 100).toFixed(0) : 0,
      painChange: painChanges.length ? (painChanges.reduce((a, b) => a + b, 0) / painChanges.length).toFixed(2) : 0,
      activityChange: activityChanges.length ? (activityChanges.reduce((a, b) => a + b, 0) / activityChanges.length).toFixed(2) : 0,
      painDistribution: calcDistribution(painChanges),
      activityDistribution: calcDistribution(activityChanges)
    };

    res.json({
      metrics: { totalSignups, activeCliniciansCount, paidClinicians, totalPatients, wau, mau, conversionRate, arpu, currentMonthRev, revChangePct, avgSessionsPerClinician, avgPatientsPerClinician, longitudinalPct, medianTTV, medianTTP },
      charts: { userGrowth: userGrowth.reverse(), testDomains: testTypes },
      outcomes: { tests: improvementsData, proms: promsData, bodyParts: bodyPartBreakdown, actionItems }
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
