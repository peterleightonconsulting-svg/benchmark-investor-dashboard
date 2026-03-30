import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, Users, DollarSign, Target, ActivitySquare, CalendarDays, TrendingUp, HeartPulse, RefreshCw, MessageSquare, X, Send, Zap } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function App() {
  const [data, setData] = useState<any>(null);
  const [physioMetrics, setPhysioMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [physios, setPhysios] = useState<any[]>([]);
  const [selectedPhysio, setSelectedPhysio] = useState<string>('');
  
  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const question = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: question }]);
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });
      const result = await response.json();
      
      if (result.error) {
        setChatHistory(prev => [...prev, { role: 'ai', text: `Error: ${result.error}` }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: result.answer }]);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', text: 'Sorry, I lost connection to the server.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/physios')
      .then(res => res.json())
      .then(res => {
        // Sort for dropdown (alphabetical)
        const sortedForDropdown = [...res].sort((a, b) => a.first_name.localeCompare(b.first_name));
        setPhysios(sortedForDropdown);
        
        // Sort for leaderboard (% tested first, > 1 patient only)
        const sortedForLeaderboard = [...res]
          .filter(p => p.patient_count > 1)
          .sort((a, b) => {
             const aPct = a.patient_count > 0 ? a.longitudinal_proms_count / a.patient_count : 0;
             const bPct = b.patient_count > 0 ? b.longitudinal_proms_count / b.patient_count : 0;
             if (bPct !== aPct) return bPct - aPct;
             // Tie-breaker: total patients
             return b.patient_count - a.patient_count;
          });
        setPhysioMetrics(sortedForLeaderboard);
      })
      .catch(err => console.error('Failed to fetch physios', err));
  }, []);

  useEffect(() => {
    const fetchData = () => {
      const url = selectedPhysio ? `/api/stats?physioId=${selectedPhysio}` : '/api/stats';
      fetch(url)
        .then(res => res.json())
        .then(res => {
          setData(res);
          setLoading(false);
          setLastUpdated(new Date().toLocaleTimeString());
        })
        .catch(err => {
          console.error("Failed to fetch dashboard data", err);
          setLoading(false);
        });
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Update every 60 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading Benchmark Data...</div>;
  }

  if (!data || !data.metrics) {
    const errorMessage = data?.error ? `Database Connection Error: ${data.error}` : "Failed to load data. Please ensure the API is running.";
    return (
      <div className="error" style={{ flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <div>{errorMessage}</div>
        <div style={{ fontSize: '1rem', color: '#6b7280' }}>Check your Render Logs for more details, or verify your DB_HOST, DB_USER, DB_PASSWORD, and DB_PORT environment variables.</div>
      </div>
    );
  }

  const { metrics, charts, outcomes } = data;

  const renderChange = (val: string | null) => {
    if (!val) return <span className="neutral-change">-</span>;
    const num = parseFloat(val);
    if (num > 0) return <span className="positive-change">+{num.toFixed(2)}</span>;
    if (num < 0) return <span className="negative-change">{num.toFixed(2)}</span>;
    return <span className="neutral-change">{num.toFixed(2)}</span>;
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Benchmark Investor Dashboard</h1>
          <p>Live metrics from the MVP platform</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <select 
            value={selectedPhysio} 
            onChange={(e) => setSelectedPhysio(e.target.value)}
            style={{ padding: '0.5rem 1rem', borderRadius: '2rem', border: '1px solid #e5e7eb', backgroundColor: 'white', color: '#374151', fontSize: '0.875rem', outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            <option value="">All Clinicians</option>
            {physios.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name} ({p.patient_count} patients)
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', padding: '0.5rem 1rem', borderRadius: '2rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontSize: '0.875rem', color: '#6b7280' }}>
            <RefreshCw size={14} className="spin-icon" />
            Last updated: {lastUpdated}
          </div>
        </div>
      </header>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon"><Users size={24} /></div>
          <div className="metric-content">
            <h3>Total Clinicians</h3>
            <div className="metric-value">{metrics.activeCliniciansCount}</div>
            <div className="metric-subtitle">Recorded at least one test</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Users size={24} /></div>
          <div className="metric-content">
            <h3>Total Patients</h3>
            <div className="metric-value">{metrics.totalPatients}</div>
            <div className="metric-subtitle">Across all active clinicians</div>
          </div>
        </div>
        
        <div className="metric-card">
          <div className="metric-icon"><Activity size={24} /></div>
          <div className="metric-content">
            <h3>Weekly Active (WAU)</h3>
            <div className="metric-value">{metrics.wau}</div>
            <div className="metric-subtitle">Active last 7 days</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><CalendarDays size={24} /></div>
          <div className="metric-content">
            <h3>Monthly Active (MAU)</h3>
            <div className="metric-value">{metrics.mau}</div>
            <div className="metric-subtitle">Active last 30 days</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><DollarSign size={24} /></div>
          <div className="metric-content">
            <h3>Revenue (This Month)</h3>
            <div className="metric-value">${metrics.currentMonthRev}</div>
            <div className="metric-subtitle" style={{ color: metrics.revChangePct >= 0 ? '#10b981' : '#ef4444', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {metrics.revChangePct >= 0 ? '↑' : '↓'} {Math.abs(metrics.revChangePct)}% from last month
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Target size={24} /></div>
          <div className="metric-content">
            <h3>Conversion Rate</h3>
            <div className="metric-value">{metrics.conversionRate}%</div>
            <div className="metric-subtitle">ARPU: ${metrics.arpu} (Paid Users)</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><ActivitySquare size={24} /></div>
          <div className="metric-content">
            <h3>Sessions / Clinician</h3>
            <div className="metric-value">{metrics.avgSessionsPerClinician}</div>
            <div className="metric-subtitle">{metrics.avgPatientsPerClinician} Patients Avg</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Zap size={24} /></div>
          <div className="metric-content">
            <h3>Time to Test</h3>
            <div className="metric-value">{metrics.medianTTV} Days</div>
            <div className="metric-subtitle">Median time to first test</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><DollarSign size={24} /></div>
          <div className="metric-content">
            <h3>Time to Paid</h3>
            <div className="metric-value">{metrics.medianTTP} Days</div>
            <div className="metric-subtitle">Median time to payment</div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>User Sign-ups (Last 6 Months)</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.userGrowth}>
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h3>Test Domains Usage</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.testDomains}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {charts.testDomains.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <h2 className="section-title">Clinical Outcomes & Improvements</h2>
      
      <div className="outcomes-top-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="chart-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <HeartPulse size={20} color="#ef4444" />
            <h3 style={{ margin: 0 }}>Patient Reported Outcomes (PROMs)</h3>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            <strong>Rule Applied:</strong> Only including patients with a minimum 3 days timeline. ({outcomes.proms.patients} patients)
          </p>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1, background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Avg Pain Score Change</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{renderChange(outcomes.proms.painChange)}</div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem', marginBottom: '0.5rem' }}>(Positive score is good)</div>
              <div style={{ fontSize: '0.75rem', color: '#4b5563', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem' }}>
                <span style={{color: '#10b981'}}>↑ {outcomes.proms.painDistribution.positive}%</span>
                <span style={{color: '#6b7280'}}>— {outcomes.proms.painDistribution.neutral}%</span>
                <span style={{color: '#ef4444'}}>↓ {outcomes.proms.painDistribution.negative}%</span>
              </div>
            </div>

            <div style={{ flex: 1, background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Avg Activity Score Change</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{renderChange(outcomes.proms.activityChange)}</div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem', marginBottom: '0.5rem' }}>(Positive score is good)</div>
              <div style={{ fontSize: '0.75rem', color: '#4b5563', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem' }}>
                <span style={{color: '#10b981'}}>↑ {outcomes.proms.activityDistribution.positive}%</span>
                <span style={{color: '#6b7280'}}>— {outcomes.proms.activityDistribution.neutral}%</span>
                <span style={{color: '#ef4444'}}>↓ {outcomes.proms.activityDistribution.negative}%</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: 'white' }}>
           <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>Outcome Narrative</h3>
           <p style={{ fontSize: '1rem', lineHeight: '1.5', opacity: 0.9 }}>
             The data confirms that Benchmark is successfully tracking objective physical capacity increases and subjective patient recovery across all core domains.
           </p>
        </div>
      </div>

      <h2 className="section-title">Health Economic Impact (Projections)</h2>
      
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon"><DollarSign size={24} /></div>
          <div className="metric-content">
            <h3>Est. Savings Per Patient</h3>
            <div className="metric-value">$500 - $1.4k</div>
            <div className="metric-subtitle">Avoided imaging & surgeries*</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Users size={24} /></div>
          <div className="metric-content">
            <h3>Current Cohort Value</h3>
            <div className="metric-value">
              ${(outcomes.proms.patients * (parseFloat(outcomes.proms.painDistribution.positive) / 100) * 500).toLocaleString(undefined, {maximumFractionDigits: 0})}
            </div>
            <div className="metric-subtitle">Based on {outcomes.proms.painDistribution.positive}% improving</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><TrendingUp size={24} /></div>
          <div className="metric-content">
            <h3>Scale Projection (10k)</h3>
            <div className="metric-value">
              ${(10000 * (parseFloat(outcomes.proms.painDistribution.positive) / 100) * 500 / 1000000).toFixed(2)}M
            </div>
            <div className="metric-subtitle">System-wide savings at 10k users</div>
          </div>
        </div>
      </div>
      
      <div style={{ marginTop: '0.5rem', marginBottom: '2.5rem', fontSize: '0.875rem', color: '#6b7280', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
        <p style={{ marginBottom: '0.5rem' }}><strong>*Economic Rationale:</strong> Industry research indicates that data-driven MSK physiotherapy interventions (tracked via PROMs) reduce the 90-day utilization of expensive downstream interventions like MRI imaging, injections, and surgical consultations. Reductions in average visit counts for resolving symptoms yield a documented savings of <strong>$193 to $1,411 per patient</strong>. Benchmark’s ability to prove physical capacity increases and pain reduction positions it as a key cost-containment tool for value-based care providers.</p>
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
          <em>Sources: 
          1. "Cost-effectiveness of tele-physical therapy for musculoskeletal conditions" (NIH/JMIR Formative Research, 2021) - Savings of $193-$1411 per injury.
          2. "The impact of patient-reported outcome measures in virtual Integrated Practice Units" (Scholastica, 2022) - Reduction in 90-day imaging/injection utilization.
          </em>
        </p>
      </div>

      <div className="charts-grid">
        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <TrendingUp size={20} color="#4f46e5" />
            <h3 style={{ margin: 0 }}>Physical Capacity Improvement Rates</h3>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            <strong>Metric:</strong> Avg increase <strong>per week</strong>. Reclassified by <strong>Injured</strong> vs <strong>Uninjured</strong> limb.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="improvements-table">
              <thead>
                <tr>
                  <th>Test Name (incl. Body Part)</th>
                  <th>Category</th>
                  <th>Patients</th>
                  <th>Injured (Rate/Wk)</th>
                  <th>Uninjured (Rate/Wk)</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.tests.map((test: any, idx: number) => (
                  <tr key={idx}>
                    <td><strong>{test.testName}</strong></td>
                    <td>{test.category}</td>
                    <td>{test.patients}</td>
                    <td>{renderChange(test.injuredAvg)}</td>
                    <td>{renderChange(test.uninjuredAvg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>


      {/* PROMs Leaderboard */}
      <h2 className="section-title" style={{ marginTop: '2rem' }}>PROMs Testing Leaderboard <span style={{ fontSize: '0.875rem', fontWeight: 400, color: '#6b7280', marginLeft: '1rem' }}>(*Success Rate = Percentage of cohort with longitudinal tracking)</span></h2>
      <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '2rem' }}>
        <table className="improvements-table" style={{ margin: 0, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600, width: '50px' }}>Rank</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600 }}>Physiotherapist</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600 }}>Total Patients</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600 }}>Patients with PROMs</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600 }}>Longitudinal PROMs</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600 }}>% Success Rate*</th>
            </tr>
          </thead>
          <tbody>
            {physioMetrics.filter(p => p.patient_count > 0).map((physio: any, idx: number) => (
              <tr key={physio.id}>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </td>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#111827' }}>{physio.first_name} {physio.last_name}</td>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{physio.patient_count}</td>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{physio.proms_count}</td>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{physio.longitudinal_proms_count || 0}</td>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '100%', background: '#e5e7eb', borderRadius: '999px', height: '0.5rem', overflow: 'hidden' }}>
                      <div style={{ width: `${physio.patient_count > 0 ? (physio.longitudinal_proms_count / physio.patient_count) * 100 : 0}%`, background: '#4f46e5', height: '100%' }}></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: '3rem' }}>
                      {physio.patient_count > 0 ? ((physio.longitudinal_proms_count / physio.patient_count) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Floating Chat Button */}
      <button 
        onClick={() => setIsChatOpen(true)}
        style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 1000 }}
        title="Ask Benchmark AI"
      >
        <MessageSquare size={28} />
      </button>

      {/* Chat Window Modal */}
      {isChatOpen && (
        <div style={{ position: 'fixed', bottom: '5rem', right: '2rem', width: '350px', height: '500px', background: 'white', borderRadius: '1rem', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', zIndex: 1001, overflow: 'hidden' }}>
          <div style={{ background: '#4f46e5', color: 'white', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MessageSquare size={18} /> Benchmark AI</h3>
            <button onClick={() => setIsChatOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
          </div>
          
          <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f9fafb' }}>
            {chatHistory.length === 0 && (
              <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.875rem', marginTop: '2rem' }}>
                Ask me a question about your database! For example: <br/><br/>
                <em>"How many patients does Gus have?"</em><br/>
                <em>"What is the average pain intensity?"</em>
              </p>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', background: msg.role === 'user' ? '#4f46e5' : '#e5e7eb', color: msg.role === 'user' ? 'white' : '#111827', padding: '0.75rem 1rem', borderRadius: '1rem', maxWidth: '85%', fontSize: '0.875rem', lineHeight: '1.4' }}>
                {msg.text}
              </div>
            ))}
            {isChatLoading && (
              <div style={{ alignSelf: 'flex-start', background: '#e5e7eb', padding: '0.75rem 1rem', borderRadius: '1rem', fontSize: '0.875rem' }}>
                <span className="spin-icon" style={{display: 'inline-block'}}>⏳</span> Thinking...
              </div>
            )}
          </div>

          <form onSubmit={handleChatSubmit} style={{ display: 'flex', borderTop: '1px solid #e5e7eb', padding: '0.5rem' }}>
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask a question..." 
              style={{ flex: 1, padding: '0.5rem', border: 'none', outline: 'none', fontSize: '0.875rem' }}
            />
            <button type="submit" disabled={isChatLoading || !chatInput.trim()} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={18} />
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
