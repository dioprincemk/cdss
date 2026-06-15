// pages/dashboard/DashboardPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Users, ClipboardList, Cpu, TrendingUp, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { aiApi, patientApi, assessmentApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import type { Prediction } from '@/types';
import { format } from 'date-fns';

const SEVERITY_COLOR: Record<string, string> = {
  Normal: '#10B981', Pneumonia: '#EF4444', 'COVID-19': '#F59E0B', Tuberculosis: '#8B5CF6',
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [modelInfo, setModelInfo]     = useState<any>(null);
  const [recentPreds, setRecentPreds] = useState<Prediction[]>([]);
  const [stats, setStats]             = useState({ patients: 0, assessments: 0, predictions: 0 });
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    Promise.allSettled([
      aiApi.activeModel(),
      aiApi.recentPredictions(8),
      patientApi.list({ limit: 1 }),
    ]).then(([model, preds, pts]) => {
      if (model.status === 'fulfilled') setModelInfo(model.value.data);
      if (preds.status === 'fulfilled')  setRecentPreds(preds.value.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const chartData = recentPreds.reduce((acc: any[], p) => {
    const cls = p.top_prediction ?? p.predicted_class;
    const existing = acc.find(d => d.name === cls);
    if (existing) existing.count++;
    else acc.push({ name: cls, count: 1 });
    return acc;
  }, []);

  return (
    <div className="page-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>Good {getGreeting()}, Dr. {user?.full_name?.split(' ').pop()}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {format(new Date(), "EEEE, d MMMM yyyy")} · CDSS Pulmonary AI
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/assessment')}>
          <ClipboardList size={16} />
          New Assessment
        </button>
      </div>

      {/* Model status banner */}
      {!loading && (
        <div className="glass-card" style={{
          padding: '0.875rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          borderColor: modelInfo?.is_loaded ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)',
          background: modelInfo?.is_loaded ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
        }}>
          {modelInfo?.is_loaded
            ? <CheckCircle2 size={18} color="var(--accent-emerald)" />
            : <AlertCircle size={18} color="var(--accent-amber)" />}
          <span style={{ fontSize: '0.875rem', color: modelInfo?.is_loaded ? 'var(--accent-emerald)' : 'var(--accent-amber)', fontWeight: 500 }}>
            {modelInfo?.is_loaded
              ? `AI Model Active — ${modelInfo.architecture} · Classes: ${modelInfo.class_labels?.join(', ')}`
              : 'No AI model active. Visit Model Management to upload and activate a model.'}
          </span>
          {user?.role === 'admin' && !modelInfo?.is_loaded && (
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/models')} style={{ marginLeft: 'auto' }}>
              Manage Models
            </button>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid-4 stagger-children" style={{ '--cols': 4 } as any}>
        {[
          { label: 'Total Patients',     icon: Users,          value: stats.patients,     color: 'var(--accent-blue)' },
          { label: 'Assessments',        icon: ClipboardList,  value: stats.assessments,  color: 'var(--accent-teal)' },
          { label: 'AI Predictions',     icon: Activity,       value: recentPreds.length, color: 'var(--accent-purple)' },
          { label: 'Model Architecture', icon: Cpu,            value: modelInfo?.architecture ?? 'N/A', color: 'var(--accent-emerald)', isText: true },
        ].map(({ label, icon: Icon, value, color, isText }) => (
          <div key={label} className="glass-card animate-fade-in" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `color-mix(in srgb, ${color} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={15} color={color} />
              </div>
            </div>
            <div style={{ fontSize: isText ? '1rem' : '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {loading ? '—' : value}
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Recent predictions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {/* Bar chart */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Prediction Distribution</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={32}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={SEVERITY_COLOR[entry.name] ?? 'var(--accent-blue)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No prediction data yet
            </div>
          )}
        </div>

        {/* Recent predictions */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem' }}>Recent Predictions</h3>
            <TrendingUp size={16} color="var(--text-muted)" />
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
          ) : recentPreds.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>No predictions yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentPreds.slice(0, 6).map((pred) => (
                <div
                  key={pred.id}
                  onClick={() => navigate(`/results/${pred.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--glass-low)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-mid)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--glass-low)')}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: SEVERITY_COLOR[pred.top_prediction ?? pred.predicted_class] ?? 'var(--accent-blue)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pred.top_prediction ?? pred.predicted_class}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {(pred.top_confidence * 100).toFixed(1)}% confidence
                    </div>
                  </div>
                  <ChevronRight size={14} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
