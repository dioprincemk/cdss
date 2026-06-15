// pages/patient/PatientListPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, ChevronRight, Calendar } from 'lucide-react';
import { patientApi } from '@/services/api';
import type { Patient } from '@/types';
import { format } from 'date-fns';

export default function PatientListPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      patientApi.list(search ? { search } : {})
        .then(r => setPatients(r.data))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.2rem' }}>Patients</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{patients.length} registered</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/assessment')}>
          <UserPlus size={15} /> New Patient
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.25rem', maxWidth: 400 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="form-input"
          placeholder="Search by name or patient ID…"
          style={{ paddingLeft: '2.25rem' }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><span className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : patients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          <UserPlus size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p>No patients found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {patients.map(p => {
            const dob = new Date(p.date_of_birth);
            const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/patients/${p.id}`)}
                className="glass-card"
                style={{ padding: '1rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-high)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {p.full_name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.925rem' }}>{p.full_name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                    <span>ID: {p.patient_id}</span>
                    <span>Age: {age}</span>
                    <span style={{ textTransform: 'capitalize' }}>{p.sex}</span>
                  </div>
                </div>
                {p.created_at && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }} className="hide-mobile">
                    <Calendar size={12} /> {format(new Date(p.created_at), 'd MMM yyyy')}
                  </div>
                )}
                <ChevronRight size={16} color="var(--text-muted)" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
