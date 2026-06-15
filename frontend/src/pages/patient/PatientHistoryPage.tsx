// pages/patient/PatientHistoryPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardList, ChevronRight, Activity } from 'lucide-react';
import { patientApi, assessmentApi } from '@/services/api';
import type { Patient, Assessment } from '@/types';
import { format } from 'date-fns';

export default function PatientHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient]       = useState<Patient | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([patientApi.get(id), assessmentApi.forPatient(id)])
      .then(([p, a]) => { setPatient(p.data); setAssessments(a.data ?? []); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><span className="spinner" style={{ width: 32, height: 32 }} /></div>;
  if (!patient) return <div className="page-content"><p>Patient not found</p></div>;

  const age = Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000));

  return (
    <div className="page-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={16} /></button>
        <h2>Patient History</h2>
      </div>

      {/* Patient card */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
          {patient.full_name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ marginBottom: '0.25rem' }}>{patient.full_name}</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            <span>ID: {patient.patient_id}</span>
            <span>Age: {age}</span>
            <span style={{ textTransform: 'capitalize' }}>{patient.sex}</span>
            {patient.contact_phone && <span>📞 {patient.contact_phone}</span>}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/assessment')}>
          <ClipboardList size={14} /> New Assessment
        </button>
      </div>

      {/* Assessments */}
      <div>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Assessment History ({assessments.length})</h3>
        {assessments.length === 0 ? (
          <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Activity size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
            <p>No assessments yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {assessments.map(a => (
              <div key={a.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                onClick={() => a.predictions?.[0] && navigate(`/results/${a.predictions[0].id}`)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{a.chief_complaint}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span>{format(new Date(a.created_at), 'd MMM yyyy')}</span>
                    {a.symptom_duration && <span>Duration: {a.symptom_duration}</span>}
                    <span className={`badge ${a.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>{a.status}</span>
                  </div>
                </div>
                <ChevronRight size={16} color="var(--text-muted)" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
