import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine, ScatterChart, Scatter, CartesianGrid, ZAxis, Legend, Line } from 'recharts';
import { Activity, Users, DollarSign, Target, ActivitySquare, CalendarDays, TrendingUp, HeartPulse, RefreshCw, MessageSquare, X, Send, Zap } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

function linearReg(pts: {x: number, y: number}[]) {
  const n = pts.length;
  if (n < 2) return { m: 0, b: 0, r2: 0 };
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const ssxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const ssxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const m = ssxx ? ssxy / ssxx : 0;
  const b = my - m * mx;
  const ssTot = pts.reduce((s, p) => s + (p.y - my) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - (m * p.x + b)) ** 2, 0);
  return {
    m: parseFloat(m.toFixed(3)),
    b: parseFloat(b.toFixed(3)),
    r2: parseFloat((ssTot ? 1 - ssRes / ssTot : 0).toFixed(3)),
  };
}

const BODY_PART_COLORS = [
  { part: 'Knee',         color: '#4f46e5' },
  { part: 'Shoulder',     color: '#f59e0b' },
  { part: 'Lumbar Spine', color: '#10b981' },
  { part: 'Ankle',        color: '#ef4444' },
  { part: 'Hip',          color: '#8b5cf6' },
  { part: 'Elbow',        color: '#06b6d4' },
  { part: 'Other',        color: '#9ca3af' },
];

const sortBuckets = (data: any[], order: string[]) =>
  [...data].sort((a, b) => {
    const ai = order.indexOf(a.group);
    const bi = order.indexOf(b.group);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

const CorrelationChart = ({ title, data, note }: { title: string; data: any[]; note?: string }) => {
  const chartHeight = Math.max(160, data.length * 48 + 40);
  return (
    <div className="chart-card">
      <h3 style={{ marginBottom: note ? '0.25rem' : '1rem' }}>{title}</h3>
      {note && <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '1rem' }}>{note}</p>}
      {data.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0', fontSize: '0.875rem' }}>Not enough data (min. 2 patients per group)</p>
      ) : (
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="group" width={120} tick={{ fontSize: 11 }} />
              <RechartsTooltip
                formatter={(val: any) => typeof val === 'number' ? val.toFixed(2) : val}
                labelFormatter={(label: string, payload: any[]) => `${label} (n=${payload?.[0]?.payload?.count ?? '?'})`}
              />
              <ReferenceLine x={0} stroke="#d1d5db" />
              <Bar dataKey="avgPainChange" name="Pain Change" fill="#ef4444" radius={[0, 3, 3, 0]} />
              <Bar dataKey="avgFunctionChange" name="Function Change" fill="#10b981" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 4 }} />Pain Change</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#10b981', borderRadius: 2, marginRight: 4 }} />Function Change</span>
      </div>
    </div>
  );
};

function sigStars(p: number) {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  if (p < 0.1) return '.';
  return 'ns';
}

function cleanPredName(name: string): string {
  const labels: Record<string, string> = {
    const: 'Intercept',
    baseline_pain: 'Baseline Pain',
    baseline_function: 'Baseline Function',
    treatment_days: 'Treatment Duration (days)',
    n_sessions: 'No. of Sessions',
  };
  if (labels[name]) return labels[name];
  return name.replace(/^gender_/, '').replace(/^activity_level_/, '').replace(/^body_part_/, '');
}

const RegressionChart = ({ model }: { model: any }) => {
  const isLogit = model.type === 'logit';
  const preds = model.predictors.filter((p: any) => p.name !== 'const');
  const sorted = [...preds].sort((a: any, b: any) => Math.abs(b.coef) - Math.abs(a.coef));
  const chartData = sorted.map((p: any) => ({
    name: cleanPredName(p.name),
    coef: p.coef,
    p: p.p,
    se: p.se,
    ci_low: p.ci_low,
    ci_high: p.ci_high,
    or: p.or,
    or_ci_low: p.or_ci_low,
    or_ci_high: p.or_ci_high,
    sig: p.p < 0.05,
  }));
  const chartHeight = Math.max(200, chartData.length * 40 + 40);
  const fitStats = isLogit
    ? `McFadden R² = ${model.pseudo_r2}  ·  n = ${model.n}  ·  events = ${model.n_events}`
    : `R² = ${model.r2}  ·  Adj. R² = ${model.r2_adj}  ·  F p${model.f_pvalue < 0.001 ? ' < 0.001' : ` = ${model.f_pvalue}`}  ·  n = ${model.n}`;
  return (
    <div className="chart-card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.25rem' }}>
          {isLogit ? 'Logit — P(Improved in Both Pain + Function)' : `OLS — Δ ${model.label}`}
        </h3>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
          {fitStats}{isLogit ? ' · Coefficients are log-odds; positive = higher probability of improving in both metrics' : ''}
        </p>
      </div>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 50, bottom: 5, left: 165 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toFixed(2)} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
            <RechartsTooltip content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#111827' }}>{d.name}</p>
                  <p style={{ margin: 0, color: '#6b7280' }}>Coef: <strong>{d.coef > 0 ? '+' : ''}{d.coef}</strong></p>
                  {d.or !== undefined && <p style={{ margin: 0, color: '#6b7280' }}>Odds Ratio: <strong>{d.or}</strong> [{d.or_ci_low}, {d.or_ci_high}]</p>}
                  <p style={{ margin: 0, color: '#6b7280' }}>95% CI: [{d.ci_low}, {d.ci_high}]</p>
                  <p style={{ margin: 0, color: '#6b7280' }}>p = {d.p} <strong>{sigStars(d.p)}</strong></p>
                </div>
              );
            }} />
            <ReferenceLine x={0} stroke="#9ca3af" />
            <Bar dataKey="coef" name="Coefficient" radius={[0, 3, 3, 0]}>
              {chartData.map((_: any, i: number) => (
                <Cell key={i} fill={chartData[i].sig ? (chartData[i].coef > 0 ? '#10b981' : '#ef4444') : '#d1d5db'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#10b981', borderRadius: 2, marginRight: 4 }} />Positive (p&lt;0.05)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 4 }} />Negative (p&lt;0.05)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#d1d5db', borderRadius: 2, marginRight: 4 }} />Not significant</span>
      </div>
    </div>
  );
};

export default function App() {
  const [data, setData] = useState<any>(null);
  const [physioMetrics, setPhysioMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [physios, setPhysios] = useState<any[]>([]);
  const [selectedPhysio, setSelectedPhysio] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'investor' | 'physio' | 'analysis'>('investor');
  const [capacitySearch, setCapacitySearch] = useState('');
  const [corrData, setCorrData] = useState<any>(null);
  const [scatterData, setScatterData] = useState<any>(null);
  const [regressionData, setRegressionData] = useState<any>(null);
  
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
        headers: { 
          'Content-Type': 'application/json'
        },
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
    const url = selectedPhysio ? `/api/correlations?physioId=${selectedPhysio}` : '/api/correlations';
    fetch(url)
      .then(res => res.json())
      .then(res => setCorrData(res))
      .catch(err => console.error('Failed to fetch correlation data', err));
  }, [selectedPhysio]);

  useEffect(() => {
    const url = selectedPhysio ? `/api/scatter?physioId=${selectedPhysio}` : '/api/scatter';
    fetch(url)
      .then(res => res.json())
      .then(res => setScatterData(res))
      .catch(err => console.error('Failed to fetch scatter data', err));
  }, [selectedPhysio]);

  useEffect(() => {
    fetch('/api/regression')
      .then(res => res.ok ? res.json() : null)
      .then(res => res && setRegressionData(res))
      .catch(() => {});
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
  }, [selectedPhysio]);

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
  const isAdmin = true;

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
          <h1>{isAdmin ? 'Benchmark Investor Dashboard' : 'Your Clinical Outcomes'}</h1>
          <p>Live metrics from the MVP platform</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', background: '#f3f4f6', padding: '0.25rem', borderRadius: '2rem', marginRight: '0.5rem' }}>
            <button 
              onClick={() => setActiveTab('investor')}
              style={{ padding: '0.4rem 1.25rem', borderRadius: '2rem', border: 'none', background: activeTab === 'investor' ? 'white' : 'transparent', color: activeTab === 'investor' ? '#111827' : '#6b7280', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab === 'investor' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              Investor
            </button>
            <button
              onClick={() => setActiveTab('physio')}
              style={{ padding: '0.4rem 1.25rem', borderRadius: '2rem', border: 'none', background: activeTab === 'physio' ? 'white' : 'transparent', color: activeTab === 'physio' ? '#111827' : '#6b7280', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab === 'physio' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              Physio
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              style={{ padding: '0.4rem 1.25rem', borderRadius: '2rem', border: 'none', background: activeTab === 'analysis' ? 'white' : 'transparent', color: activeTab === 'analysis' ? '#111827' : '#6b7280', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab === 'analysis' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              Analysis
            </button>
          </div>
          {isAdmin && (
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
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', padding: '0.5rem 1rem', borderRadius: '2rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontSize: '0.875rem', color: '#6b7280' }}>
            <RefreshCw size={14} className="spin-icon" />
            Last updated: {lastUpdated}
          </div>
        </div>
      </header>

      {activeTab === 'investor' && (
      <>
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

        {isAdmin && (
          <>
            <div className="metric-card">
              <div className="metric-icon"><DollarSign size={24} /></div>
              <div className="metric-content">
                <h3>Revenue (This Month)</h3>
                <div className="metric-value">£{metrics.currentMonthRev}</div>
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
                <div className="metric-subtitle">Active to Paid</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon"><Users size={24} /></div>
              <div className="metric-content">
                <h3>Paid Clinicians</h3>
                <div className="metric-value">{metrics.paidClinicians}</div>
                <div className="metric-subtitle">ARPU: £{metrics.arpu}</div>
              </div>
            </div>
          </>
        )}

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

        {isAdmin && (
          <div className="metric-card">
            <div className="metric-icon"><DollarSign size={24} /></div>
            <div className="metric-content">
              <h3>Time to Paid</h3>
              <div className="metric-value">{metrics.medianTTP} Days</div>
              <div className="metric-subtitle">Median time to payment</div>
            </div>
          </div>
        )}
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
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Avg Function Score Change</div>
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
            <div className="metric-value">£500 - £1.4k</div>
            <div className="metric-subtitle">Avoided imaging & surgeries*</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Users size={24} /></div>
          <div className="metric-content">
            <h3>Current Cohort Value</h3>
            <div className="metric-value" style={{ color: '#10b981' }}>
              £{(outcomes.proms.patients * (parseFloat(outcomes.proms.painDistribution.positive) / 100) * 500).toLocaleString(undefined, {maximumFractionDigits: 0})}
            </div>
            <div className="metric-subtitle">Based on {outcomes.proms.painDistribution.positive}% improving</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><TrendingUp size={24} /></div>
          <div className="metric-content">
            <h3>Scale Projection (10k)</h3>
            <div className="metric-value">
              £{(10000 * (parseFloat(outcomes.proms.painDistribution.positive) / 100) * 500 / 1000000).toFixed(2)}M
            </div>
            <div className="metric-subtitle">System-wide savings at 10k users</div>
          </div>
        </div>
      </div>
      
      <div style={{ marginTop: '0.5rem', marginBottom: '2.5rem', fontSize: '0.875rem', color: '#6b7280', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
        <p style={{ marginBottom: '0.5rem' }}><strong>*Economic Rationale:</strong> Industry research indicates that data-driven MSK physiotherapy interventions (tracked via PROMs) reduce the 90-day utilization of expensive downstream interventions like MRI imaging, injections, and surgical consultations. Reductions in average visit counts for resolving symptoms yield a documented savings of <strong>£193 to £1,411 per patient</strong>. Benchmark’s ability to prove physical capacity increases and pain reduction positions it as a key cost-containment tool for value-based care providers.</p>
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
          <em>Sources: 
          1. "Cost-effectiveness of tele-physical therapy for musculoskeletal conditions" (NIH/JMIR Formative Research, 2021) - Savings of £193-£1411 per injury.
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
            <strong>Metric:</strong> Avg increase <strong>per week</strong>. Reclassified by <strong>Injured</strong> vs <strong>Uninjured</strong> limb (tests with no laterality appear under Injured).
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
                    <td>{renderChange(test.injuredAvg || test.noLatAvg)}</td>
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
            {physioMetrics.filter(p => p.patient_count > 0).slice(0, 10).map((physio: any, idx: number) => {
              return (
              <tr key={physio.id}>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </td>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#111827' }}>
                  {physio.first_name} {physio.last_name}
                </td>
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
            )})}
          </tbody>
        </table>
      </div>
      </>
      )}

      {activeTab === 'physio' && (
        <div className="physio-dashboard-view">
          <style>{`
            .physio-dashboard-view {
              --primary: #2563eb;
              --primary-dark: #1e40af;
              --primary-light: #dbeafe;
              --success: #10b981;
              --success-light: #d1fae5;
              --warning: #f59e0b;
              --warning-light: #fef3c7;
              --danger: #ef4444;
              --bg-primary: #ffffff;
              --bg-secondary: #f8fafc;
              --bg-card: #ffffff;
              --text-primary: #0f172a;
              --text-secondary: #64748b;
              --border: #e2e8f0;
              --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
              --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
              padding-top: 1rem;
            }
            .physio-hero {
              background: linear-gradient(135deg, var(--primary), var(--primary-dark));
              color: white;
              padding: 2.5rem 2rem;
              border-radius: 16px;
              margin-bottom: 2rem;
              box-shadow: var(--shadow-lg);
            }
            .physio-hero h1 { font-size: 2rem; margin-bottom: 0.5rem; color: white; }
            .physio-hero p { opacity: 0.9; font-size: 1.1rem; }
            
            .physio-stats-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
              gap: 1.5rem;
              margin-bottom: 2rem;
            }
            .physio-hero-card {
              background: var(--bg-card);
              padding: 1.5rem;
              border-radius: 12px;
              box-shadow: var(--shadow);
              border: 1px solid var(--border);
            }
            .physio-card-label { color: var(--text-secondary); font-size: 0.875rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem; }
            .physio-card-value { font-size: 3rem; font-weight: 700; color: var(--primary); line-height: 1; }
            
            .physio-section {
              background: var(--bg-card);
              padding: 2rem;
              border-radius: 12px;
              box-shadow: var(--shadow);
              border: 1px solid var(--border);
              margin-bottom: 2rem;
            }
            .physio-section-title { font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; border-bottom: 2px solid var(--border); padding-bottom: 1rem; }
            
            .physio-outcome-cards {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 1rem;
              margin-bottom: 2rem;
            }
            .physio-outcome-card { text-align: center; padding: 1.25rem; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--border); }
            .physio-outcome-value { font-size: 2.25rem; font-weight: 700; color: var(--success); margin-bottom: 0.25rem; }
            
            .physio-table { width: 100%; border-collapse: collapse; }
            .physio-table th { text-align: left; padding: 0.75rem; color: var(--text-secondary); border-bottom: 2px solid var(--border); font-size: 0.875rem; }
            .physio-table td { padding: 1rem 0.75rem; border-bottom: 1px solid var(--border); }
            
            .physio-action-item {
              display: flex; align-items: center; justify-content: space-between; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--primary); margin-bottom: 0.75rem;
            }
            
            .physio-capacity-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
            .physio-capacity-card { padding: 1.25rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border); }
            
            .custom-tooltip {
              position: relative;
              display: inline-block;
              cursor: help;
              border-bottom: 1px dotted #64748b;
              margin-left: 4px;
            }
            .custom-tooltip .tooltip-text {
              visibility: hidden;
              width: 250px;
              background-color: #1e293b;
              color: #fff;
              text-align: center;
              border-radius: 6px;
              padding: 0.75rem;
              position: absolute;
              z-index: 1000;
              bottom: 125%;
              left: 50%;
              margin-left: -125px;
              opacity: 0;
              transition: opacity 0.2s;
              font-size: 0.75rem;
              font-weight: normal;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              pointer-events: none;
            }
            .custom-tooltip .tooltip-text::after {
              content: "";
              position: absolute;
              top: 100%;
              left: 50%;
              margin-left: -5px;
              border-width: 5px;
              border-style: solid;
              border-color: #1e293b transparent transparent transparent;
            }
            .custom-tooltip:hover .tooltip-text {
              visibility: visible;
              opacity: 1;
            }
          `}</style>

          <div className="physio-hero">
            <h1>Benchmark Clinical Dashboard</h1>
            <p>Welcome back! You're making a real impact. Here's how your clinical practice is performing today.</p>
          </div>

          <div className="physio-stats-grid">
            <div className="physio-hero-card">
              <div className="physio-card-label">Collection Rate (Follow-ups)</div>
              <div className="physio-card-value">{metrics.longitudinalPct}%</div>
              <div style={{ marginTop: '1rem', height: '8px', background: '#f1f5f9', borderRadius: '4px' }}>
                <div style={{ width: `${metrics.longitudinalPct}%`, height: '100%', background: 'var(--success)', borderRadius: '4px' }}></div>
              </div>
            </div>
            <div className="physio-hero-card">
              <div className="physio-card-label">Patients Improving</div>
              <div className="physio-card-value">{outcomes.proms.overallImprovingPct}%</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Either pain or function</div>
              <div style={{ marginTop: '1rem', height: '8px', background: '#f1f5f9', borderRadius: '4px' }}>
                <div style={{ width: `${outcomes.proms.overallImprovingPct}%`, height: '100%', background: 'var(--success)', borderRadius: '4px' }}></div>
              </div>
            </div>
            <div className="physio-hero-card">
              <div className="physio-card-label">Improving in Both</div>
              <div className="physio-card-value">{outcomes.proms.overallImprovingBothPct}%</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Both pain and function</div>
              <div style={{ marginTop: '1rem', height: '8px', background: '#f1f5f9', borderRadius: '4px' }}>
                <div style={{ width: `${outcomes.proms.overallImprovingBothPct}%`, height: '100%', background: 'var(--success)', borderRadius: '4px' }}></div>
              </div>
            </div>
          </div>

          <div className="physio-section">
            <div className="physio-section-title"><span>📈</span> Your Clinical Outcomes</div>
            <div className="physio-outcome-cards">
              <div className="physio-outcome-card">
                <div className="physio-card-label">Avg Function Change</div>
                <div className="physio-outcome-value">+{outcomes.proms.activityChange}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Platform Avg: +1.82</div>
              </div>
              <div className="physio-outcome-card">
                <div className="physio-card-label">Avg Pain Change</div>
                <div className="physio-outcome-value">+{outcomes.proms.painChange}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Platform Avg: +1.21</div>
              </div>
              <div className="physio-outcome-card">
                <div className="physio-card-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  Reaching MCID
                  <div className="custom-tooltip">*
                    <span className="tooltip-text">Minimum Clinically Important Difference (≥2 points improvement in Pain or Function)</span>
                  </div>
                </div>
                <div className="physio-outcome-value">{outcomes.proms.overallMCIDPct}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Either Pain or Function</div>
              </div>
              <div className="physio-outcome-card">
                <div className="physio-card-label">Total Valid Cohort</div>
                <div className="physio-outcome-value">{outcomes.proms.patients}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Patients with follow-up</div>
              </div>
            </div>

            <h3 style={{ marginBottom: '1rem' }}>Performance by Body Part</h3>
            <table className="physio-table">
              <thead>
                <tr>
                  <th>Body Part</th>
                  <th>Patients</th>
                  <th>Avg Pain Change</th>
                  <th>Avg Function Change</th>
                  <th>% Improving</th>
                </tr>
              </thead>
              <tbody>
                {(outcomes.bodyParts || []).map((bp: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{bp.name}</td>
                    <td>{bp.patientCount}</td>
                    <td style={{ fontWeight: 700 }}>{renderChange(bp.avgPain)}</td>
                    <td style={{ fontWeight: 700 }}>{renderChange(bp.avgFunction)}</td>
                    <td>{bp.pctImproving}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="physio-section">
            <div className="physio-section-title"><span>💪</span> Physical Capacity Improvement Rates</div>
            
            <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
              <input 
                type="text" 
                placeholder="Search for a test (e.g., 'Hip', 'Flexion')..."
                value={capacitySearch}
                onChange={(e) => setCapacitySearch(e.target.value)}
                style={{ width: '100%', padding: '0.875rem 1rem 0.875rem 2.5rem', borderRadius: '8px', border: '2px solid var(--border)', fontSize: '0.875rem', outline: 'none' }}
              />
              <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            </div>

            <div className="physio-capacity-grid">
              {outcomes.tests
                .filter((t: any) => t.testName.toLowerCase().includes(capacitySearch.toLowerCase()) || t.category.toLowerCase().includes(capacitySearch.toLowerCase()))
                .slice(0, capacitySearch ? outcomes.tests.length : 6)
                .map((test: any, i: number) => (
                <div className="physio-capacity-card" key={i}>
                  <div className="physio-card-label">{test.testName}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)', marginBottom: '0.25rem' }}>
                    {renderChange(test.injuredAvg || test.noLatAvg)} / week
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {test.patients} patients • {test.category}
                  </div>
                </div>
              ))}
            </div>
            {!capacitySearch && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                💡 <strong>Showing top 6 metrics.</strong> Use search above to find specific tests.
              </div>
            )}
          </div>

          <div className="physio-section">
            <div className="physio-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div><span>⚡</span> Action Needed</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                Suggested Action: Email patient and/or send symptoms form via symptom tab
              </div>
            </div>
            {(outcomes.actionItems || []).length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>No patients currently due for follow-up. Great job!</p>
            ) : (
              outcomes.actionItems.map((item: any, i: number) => (
                <div className="physio-action-item" key={i}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.first_name} {item.last_name}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{item.days_since} days since last session</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div>
          <h2 className="section-title">PROMs Outcomes Analysis</h2>

          {/* Key Findings Cards */}
          {corrData && scatterData && (() => {
            const longDur  = corrData.byDuration?.find((d: any) => d.group.startsWith('Long'));
            const shortDur = corrData.byDuration?.find((d: any) => d.group.startsWith('Short'));
            const durationDiff = longDur && shortDur && longDur.avgFunctionChange !== null && shortDur.avgFunctionChange !== null
              ? (parseFloat(longDur.avgFunctionChange) - parseFloat(shortDur.avgFunctionChange)).toFixed(1) : null;
            const sortedParts = [...(corrData.byBodyPart || [])]
              .filter((b: any) => b.avgFunctionChange !== null)
              .sort((a: any, b: any) => parseFloat(b.avgFunctionChange) - parseFloat(a.avgFunctionChange));
            const bothPct = scatterData.total > 0
              ? ((scatterData.quadrants.bothImproved / scatterData.total) * 100).toFixed(0) : '0';
            const r = parseFloat(scatterData.correlation);
            return (
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="metric-card">
                  <div className="metric-icon"><TrendingUp size={24} /></div>
                  <div className="metric-content">
                    <h3>Pain ↔ Function</h3>
                    <div className="metric-value">r = {scatterData.correlation}</div>
                    <div className="metric-subtitle">{r > 0.5 ? 'Strong' : r > 0.3 ? 'Moderate' : 'Weak'} positive correlation</div>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-icon"><HeartPulse size={24} /></div>
                  <div className="metric-content">
                    <h3>Improved in Both</h3>
                    <div className="metric-value">{bothPct}%</div>
                    <div className="metric-subtitle">{scatterData.quadrants.bothImproved} of {scatterData.total} patients</div>
                  </div>
                </div>
                {durationDiff && (
                  <div className="metric-card">
                    <div className="metric-icon"><CalendarDays size={24} /></div>
                    <div className="metric-content">
                      <h3>Duration → Function</h3>
                      <div className="metric-value">+{durationDiff} pts</div>
                      <div className="metric-subtitle">Long vs short treatment (12wk+ vs &lt;4wk)</div>
                    </div>
                  </div>
                )}
                {sortedParts.length >= 2 && (
                  <div className="metric-card">
                    <div className="metric-icon"><Target size={24} /></div>
                    <div className="metric-content">
                      <h3>Best Recovery</h3>
                      <div className="metric-value">{sortedParts[0].group}</div>
                      <div className="metric-subtitle">Most function improvement by body part</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Scatter Plot */}
          {scatterData && scatterData.points?.length > 0 && (() => {
            const pts = (scatterData.points as any[]).map(p => ({ x: p.delta_function, y: p.delta_pain }));
            const reg = linearReg(pts);
            const xs = pts.map(p => p.x);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const trendLine = [
              { delta_function: minX, delta_pain: parseFloat((reg.m * minX + reg.b).toFixed(2)) },
              { delta_function: maxX, delta_pain: parseFloat((reg.m * maxX + reg.b).toFixed(2)) },
            ];
            const eqSign = reg.b >= 0 ? '+' : '';
            return (
              <div className="chart-card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: '0.25rem' }}>Δ Pain vs Δ Function — per patient</h3>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                      Pearson r = <strong>{scatterData.correlation}</strong> · y = {reg.m}x {eqSign}{reg.b} · R² = {reg.r2}.
                      Each dot is one patient, coloured by body part. Top-right = both improved.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Both: {scatterData.quadrants.bothImproved}</span>
                    <span style={{ color: '#6b7280' }}>Pain only: {scatterData.quadrants.onlyPain}</span>
                    <span style={{ color: '#6b7280' }}>Function only: {scatterData.quadrants.onlyFunction}</span>
                    <span style={{ color: '#ef4444' }}>Neither: {scatterData.quadrants.neither}</span>
                  </div>
                </div>
                <div style={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 30, bottom: 45, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis type="number" dataKey="delta_function" name="Function Change" tick={{ fontSize: 11 }} label={{ value: 'Δ Function Score (positive = better)', position: 'insideBottom', offset: -30, fontSize: 11, fill: '#6b7280' }} />
                      <YAxis type="number" dataKey="delta_pain" name="Pain Change" tick={{ fontSize: 11 }} label={{ value: 'Δ Pain Score (positive = better)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#6b7280' }} />
                      <ZAxis range={[45, 45]} />
                      <RechartsTooltip content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        if (!d.body_part) return null;
                        return (
                          <div style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                            <p style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#111827' }}>{d.body_part} · {d.gender}</p>
                            <p style={{ color: '#6b7280', margin: 0 }}>Pain Δ: <strong>{d.delta_pain > 0 ? '+' : ''}{d.delta_pain}</strong></p>
                            <p style={{ color: '#6b7280', margin: 0 }}>Function Δ: <strong>{d.delta_function > 0 ? '+' : ''}{d.delta_function}</strong></p>
                          </div>
                        );
                      }} />
                      <ReferenceLine x={0} stroke="#d1d5db" strokeDasharray="5 5" />
                      <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="5 5" />
                      {BODY_PART_COLORS.map(({ part, color }) => (
                        <Scatter
                          key={part}
                          name={part}
                          data={(scatterData.points as any[]).filter(p => p.body_part === part)}
                          fill={color}
                          opacity={0.8}
                        />
                      ))}
                      <Line data={trendLine as any} type="linear" dataKey="delta_pain" stroke="#1f2937" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={false} legendType="none" />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '0.75rem', paddingBottom: '0.5rem' }} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {/* Group Breakdown Charts */}
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem', background: '#f9fafb', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
            <strong>Group comparisons:</strong> Average Δ Pain and Δ Function by patient subgroup. Positive = improvement. Only groups with 2+ patients shown.
            {corrData?.totalPatients ? ` n=${corrData.totalPatients} patients.` : ''}
          </p>

          {!corrData ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading analysis...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
              <CorrelationChart title="By Gender" data={corrData.byGender || []} />
              <CorrelationChart title="By Activity Level" data={corrData.byActivityLevel || []} />
              <CorrelationChart
                title="By Body Part"
                data={(corrData.byBodyPart || []).slice(0, 8)}
                note="Top 8 body parts by patient count"
              />
              <CorrelationChart
                title="By Number of Test Sessions"
                data={sortBuckets(corrData.bySessionCount || [], ['1 Session', '2-3 Sessions', '4+ Sessions'])}
                note="Objective test sessions recorded alongside PROMs"
              />
              <CorrelationChart
                title="By Treatment Duration"
                data={sortBuckets(corrData.byDuration || [], ['Short (<4wk)', 'Medium (4-12wk)', 'Long (12wk+)'])}
                note="Time between first and last PROMs submission"
              />
              <CorrelationChart
                title="By Baseline Pain Level"
                data={sortBuckets(corrData.byBasePain || [], ['Severe Pain (0-3)', 'Moderate Pain (4-6)', 'Mild Pain (7-10)'])}
                note="Baseline pain score (0=most pain, 10=least pain on app scale)"
              />
            </div>
          )}

          {/* Multivariate Regression */}
          {regressionData && regressionData.models?.length > 0 && (
            <div style={{ marginTop: '2.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>Multivariate Regression</h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem', background: '#f9fafb', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                <strong>What independently predicts improvement after controlling for other factors?</strong> Coloured bars are statistically significant (p &lt; 0.05). Bars are sorted by effect size. Generated {new Date(regressionData.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
              </p>
              {regressionData.models.map((model: any) => (
                <RegressionChart key={model.label} model={model} />
              ))}
            </div>
          )}
        </div>
      )}

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
