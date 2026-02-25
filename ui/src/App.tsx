import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, Users, DollarSign, Target, ActivitySquare, CalendarDays, TrendingUp, HeartPulse, RefreshCw } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function App() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/stats')
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', padding: '0.5rem 1rem', borderRadius: '2rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontSize: '0.875rem', color: '#6b7280' }}>
          <RefreshCw size={14} className="spin-icon" />
          Last updated: {lastUpdated}
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
            <h3>Conversion Rate</h3>
            <div className="metric-value">{metrics.conversionRate}%</div>
            <div className="metric-subtitle">ARPU: ${metrics.arpu}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Target size={24} /></div>
          <div className="metric-content">
            <h3>Longitudinal Data</h3>
            <div className="metric-value">{metrics.longitudinalPct}%</div>
            <div className="metric-subtitle">Patients with {`>=`} 2 sessions</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><ActivitySquare size={24} /></div>
          <div className="metric-content">
            <h3>Sessions / Clinician</h3>
            <div className="metric-value">{metrics.avgSessionsPerClinician}</div>
            <div className="metric-subtitle">{metrics.avgPatientsPerClinician} Patients / Clinician</div>
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
            <strong>Rule Applied:</strong> Only including patients with a 6wk to 5mo timeline. ({outcomes.proms.patients} patients)
          </p>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1, background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Avg Pain Score Change</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{renderChange(outcomes.proms.painChange)}</div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>(Positive score is good)</div>
            </div>

            <div style={{ flex: 1, background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Avg Activity Score Change</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{renderChange(outcomes.proms.activityChange)}</div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>(Positive score is good)</div>
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
    </div>
  );
}
