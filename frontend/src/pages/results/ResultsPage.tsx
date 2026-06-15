// pages/results/ResultsPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, AlertTriangle, CheckCircle2, Activity, Brain, FileText, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { aiApi, reportApi } from '@/services/api';
import type { Prediction } from '@/types';

const SEVERITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  Low:      { color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)' },
  Moderate: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
  High:     { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)' },
  Critical: { color: '#DC2626', bg: 'rgba(220,38,38,0.1)',   border: 'rgba(220,38,38,0.25)' },
};

const CLASS_COLORS = ['#3B82F6','#EF4444','#F59E0B','#8B5CF6','#10B981','#14B8A6','#EC4899'];

export default function ResultsPage() {
  const { predictionId } = useParams<{ predictionId: string }>();
  const navigate = useNavigate();
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!predictionId) return;
    aiApi.getPrediction(predictionId)
      .then(r => setPrediction(r.data))
      .catch(() => toast.error('Could not load prediction'))
      .finally(() => setLoading(false));
  }, [predictionId]);

  const handleDownloadReport = async () => {
    if (!prediction) return;
    setDownloading(true);
    try {
      const res = await reportApi.generate(prediction.assessment_id, prediction.id);
      const filename = res.data.report_path.split('/').pop();
      const blob = await reportApi.download(filename);
      const url = URL.createObjectURL(new Blob([blob.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch {
      toast.error('Report generation failed');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <span className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
    </div>
  );

  if (!prediction) return (
    <div className="page-content" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <AlertTriangle size={48} color="var(--accent-amber)" style={{ margin: '0 auto 1rem' }} />
      <h3>Prediction not found</h3>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: '1rem' }}>Go Back</button>
    </div>
  );

  const explanation = prediction.explanation;
  const severity = explanation?.severity ?? 'Moderate';
  const sevStyle = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.Moderate;
  const scores = prediction.confidence_scores ?? {};
  const sortedClasses = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={16} /></button>
          <div>
            <h2 style={{ marginBottom: '0.2rem' }}>Analysis Results</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Inference: {prediction.inference_time_ms}ms · ID: {prediction.id.slice(0, 8)}…
            </p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={handleDownloadReport} disabled={downloading}>
          {downloading ? <span className="spinner" /> : <Download size={15} />}
          {downloading ? 'Generating…' : 'Download PDF Report'}
        </button>
      </div>

      {/* Primary diagnosis card */}
      <div className="glass-card" style={{
        padding: '1.75rem',
        borderColor: sevStyle.border,
        background: sevStyle.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: sevStyle.bg, border: `2px solid ${sevStyle.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={24} color={sevStyle.color} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Primary Diagnosis</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: sevStyle.color, lineHeight: 1.2 }}>
              {prediction.top_prediction ?? prediction.predicted_class}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: sevStyle.color, lineHeight: 1 }}>
            {(prediction.top_confidence * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>confidence</div>
          <div className={`badge ${severity === 'Low' ? 'badge-green' : severity === 'Moderate' ? 'badge-amber' : 'badge-red'}`} style={{ marginTop: '0.5rem' }}>
            {severity} Severity
          </div>
        </div>
      </div>

      {/* Confidence scores + Grad-CAM */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {/* Confidence breakdown */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Brain size={16} color="var(--accent-blue)" /> Confidence Scores
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {sortedClasses.map(([cls, conf], i) => (
              <div key={cls}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: cls === prediction.top_prediction ? 600 : 400, color: cls === prediction.top_prediction ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {cls} {cls === prediction.top_prediction && '✓'}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: CLASS_COLORS[i % CLASS_COLORS.length] }}>
                    {(conf * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="confidence-bar">
                  <div className="confidence-bar-fill" style={{ width: `${conf * 100}%`, background: `linear-gradient(90deg, ${CLASS_COLORS[i % CLASS_COLORS.length]}, ${CLASS_COLORS[(i+1) % CLASS_COLORS.length]})` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Grad-CAM */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Grad-CAM Explainability</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Highlighted regions indicate areas influencing the AI prediction
          </p>
          {prediction.gradcam_overlay_path ? (
            <img
              src={`/static/gradcam/${prediction.gradcam_overlay_path.split('/').pop()}`}
              alt="Grad-CAM overlay"
              style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-mid)' }}
            />
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--glass-low)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.875rem', flexDirection: 'column', gap: '0.5rem' }}>
              <AlertTriangle size={24} />
              Grad-CAM not available
            </div>
          )}
        </div>
      </div>

      {/* LLM Explanation */}
      {explanation && (
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} color="var(--accent-blue)" /> Clinical AI Explanation
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                Diagnostic Explanation
              </div>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.9rem' }}>{explanation.explanation}</p>
            </div>

            {explanation.recommendations && explanation.recommendations.length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                  Recommended Next Steps
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {explanation.recommendations.map((rec, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem', background: 'var(--glass-low)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-blue-dim)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-blue)', flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ padding: '0.875rem 1rem', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              ⚕️ <strong style={{ color: 'var(--accent-amber)' }}>Clinical Disclaimer:</strong> This analysis is generated by an AI system to support clinical decision-making. It does not replace professional medical judgment. All findings must be reviewed and confirmed by a qualified healthcare professional.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
