// pages/assessment/AssessmentPage.tsx
// Multi-step workflow: Demographics → Vitals → Clinical Info → X-Ray → Analysis → Results

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronRight, ChevronLeft, Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/utils/helpers';

import { patientApi, assessmentApi, aiApi } from '@/services/api';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowStep } from '@/types';

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEPS: { id: WorkflowStep; label: string; desc: string }[] = [
  { id: 'demographics', label: 'Demographics',  desc: 'Patient information' },
  { id: 'vitals',       label: 'Vital Signs',   desc: 'Clinical measurements' },
  { id: 'clinical',     label: 'Clinical Info', desc: 'Symptoms & history' },
  { id: 'xray',         label: 'Chest X-Ray',   desc: 'Upload imaging' },
  { id: 'analysis',     label: 'AI Analysis',   desc: 'Prediction & explanation' },
];
const STEP_IDS = STEPS.map(s => s.id);

// ── Zod schemas ───────────────────────────────────────────────────────────────
const demoSchema = z.object({
  patient_id:  z.string().min(3, 'Patient ID required'),
  full_name:   z.string().min(2, 'Full name required'),
  date_of_birth: z.string().min(1, 'Date of birth required'),
  sex:         z.enum(['male', 'female', 'other']),
  contact_phone: z.string().optional(),
});

const vitalsSchema = z.object({
  temperature:       z.number().min(30).max(45).optional(),
  pulse_rate:        z.number().min(20).max(300).optional(),
  respiratory_rate:  z.number().min(5).max(80).optional(),
  spo2:              z.number().min(50).max(100).optional(),
  systolic_bp:       z.number().min(50).max(300).optional(),
  diastolic_bp:      z.number().min(30).max(200).optional(),
  weight_kg:         z.number().min(1).max(500).optional(),
  height_cm:         z.number().min(30).max(300).optional(),
});

const clinicalSchema = z.object({
  chief_complaint:  z.string().min(5, 'Chief complaint required'),
  symptom_duration: z.string().optional(),
  clinical_notes:   z.string().optional(),
  symptoms_raw:     z.string().optional(),
  conditions_raw:   z.string().optional(),
  medications_raw:  z.string().optional(),
});

export default function AssessmentPage() {
  const navigate = useNavigate();
  const wf = useWorkflowStore();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [xrayFile, setXrayFile] = useState<File | null>(null);
  const [xrayPreview, setXrayPreview] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const currentStep = STEP_IDS[currentIdx];

  // Forms
  const demoForm    = useForm({ resolver: zodResolver(demoSchema) });
  const vitalsForm  = useForm({ resolver: zodResolver(vitalsSchema) });
  const clinForm    = useForm({ resolver: zodResolver(clinicalSchema) });

  // Dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/png': [], 'image/jpeg': [], 'image/jpg': [] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop: (accepted) => {
      if (accepted[0]) {
        setXrayFile(accepted[0]);
        setXrayPreview(URL.createObjectURL(accepted[0]));
      }
    },
    onDropRejected: () => toast.error('Invalid file. Use PNG/JPG under 10MB.'),
  });

  // ── Step handlers ─────────────────────────────────────────────────────────
  const handleDemographics = demoForm.handleSubmit(async (data) => {
    try {
      const res = await patientApi.create(data);
      wf.setPatient(res.data);
      toast.success('Patient registered');
      next();
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    }
  });

  const handleVitals = vitalsForm.handleSubmit(async (data) => {
    if (!wf.patient) return;
    try {
      const res = await patientApi.recordVitals(wf.patient.id, data);
      wf.setVitalsId(res.data.id);
      toast.success(`Vitals recorded${res.data.bmi ? ` · BMI: ${res.data.bmi?.toFixed(1)}` : ''}`);
      next();
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    }
  });

  const handleClinical = clinForm.handleSubmit(async (data) => {
    if (!wf.patient) return;
    try {
      const payload = {
        patient_id:         wf.patient.id,
        vitals_id:          wf.vitalsId ?? undefined,
        chief_complaint:    data.chief_complaint,
        symptom_duration:   data.symptom_duration,
        clinical_notes:     data.clinical_notes,
        symptoms:           data.symptoms_raw?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
        medical_conditions: data.conditions_raw?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
        current_medications: data.medications_raw?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
      };
      const res = await assessmentApi.create(payload);
      wf.setAssessmentId(res.data.assessment_id);
      toast.success('Clinical info saved');
      next();
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    }
  });

  const handleXray = async () => {
    if (!xrayFile || !wf.assessmentId) return;
    try {
      const res = await assessmentApi.uploadXray(wf.assessmentId, xrayFile);
      wf.setImageId(res.data.image_id);
      toast.success('X-ray uploaded');
      next();
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    }
  };

  const handleAnalyse = async () => {
    if (!wf.assessmentId || !wf.imageId) return;
    setAnalysing(true);
    setAnalysisError(null);
    try {
      const res = await aiApi.predict(wf.assessmentId, wf.imageId);
      wf.setPredictionResult(res.data);
      toast.success('Analysis complete!');
      navigate(`/results/${res.data.prediction_id}`);
      wf.reset();
    } catch (err: any) {
      const msg = extractErrorMessage(err);
      setAnalysisError(msg);
      toast.error(msg);
    } finally {
      setAnalysing(false);
    }
  };

  const next = () => setCurrentIdx(i => Math.min(i + 1, STEPS.length - 1));
  const back = () => setCurrentIdx(i => Math.max(i - 1, 0));

  // ── BMI display ──────────────────────────────────────────────────────────
  const [bmiDisplay, setBmiDisplay] = useState<number | null>(null);
  const w = vitalsForm.watch('weight_kg');
  const h = vitalsForm.watch('height_cm');
  if (w && h && h > 0) {
    const b = parseFloat((w / ((h / 100) ** 2)).toFixed(1));
    if (b !== bmiDisplay) setBmiDisplay(b);
  }

  return (
    <div className="page-content animate-fade-in" style={{ maxWidth: 820 }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '0.25rem' }}>New Clinical Assessment</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Complete all steps to generate an AI-assisted diagnosis</p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '2rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {STEPS.map(({ id, label }, i) => {
          const done   = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined, minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                <div className={`step-dot ${active ? 'active' : done ? 'complete' : 'pending'}`}>
                  {done ? <Check size={14} /> : i + 1}
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: active ? 600 : 400, color: active ? 'var(--accent-blue)' : done ? 'var(--accent-emerald)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: i < currentIdx ? 'var(--accent-emerald)' : 'var(--border-subtle)', margin: '0 0.5rem', marginBottom: '1.2rem', transition: 'background var(--transition-base)' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="glass-card" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
        {/* ── Step 1: Demographics ── */}
        {currentStep === 'demographics' && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Patient Demographics</h3>
            <form onSubmit={handleDemographics} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Patient ID *</label>
                <input {...demoForm.register('patient_id')} className="form-input" placeholder="P-001" />
                {demoForm.formState.errors.patient_id && <span className="form-error">{String(demoForm.formState.errors.patient_id.message)}</span>}
              </div>
              <div className="form-group" style={{ gridColumn: 'span 1' }}>
                <label className="form-label">Full Name *</label>
                <input {...demoForm.register('full_name')} className="form-input" placeholder="John Doe" />
                {demoForm.formState.errors.full_name && <span className="form-error">{String(demoForm.formState.errors.full_name.message)}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth *</label>
                <input {...demoForm.register('date_of_birth')} type="date" className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Sex *</label>
                <select {...demoForm.register('sex')} className="form-select">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input {...demoForm.register('contact_phone')} className="form-input" placeholder="+1 555 000 0000" />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary">
                  Save & Continue <ChevronRight size={16} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Step 2: Vitals ── */}
        {currentStep === 'vitals' && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Vital Signs</h3>
            {bmiDisplay && (
              <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', background: 'var(--accent-blue-dim)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--accent-blue)' }}>
                Calculated BMI: <strong>{bmiDisplay}</strong>
              </div>
            )}
            <form onSubmit={handleVitals} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {[
                { name: 'temperature',      label: 'Temperature (°C)',   placeholder: '37.0',  step: 0.1 },
                { name: 'pulse_rate',        label: 'Pulse Rate (bpm)',   placeholder: '72',    step: 1 },
                { name: 'respiratory_rate',  label: 'Resp. Rate (/min)', placeholder: '16',    step: 1 },
                { name: 'spo2',              label: 'SpO2 (%)',           placeholder: '98',    step: 0.1 },
                { name: 'systolic_bp',       label: 'Systolic BP',        placeholder: '120',   step: 1 },
                { name: 'diastolic_bp',      label: 'Diastolic BP',       placeholder: '80',    step: 1 },
                { name: 'weight_kg',         label: 'Weight (kg)',        placeholder: '70',    step: 0.1 },
                { name: 'height_cm',         label: 'Height (cm)',        placeholder: '170',   step: 0.1 },
              ].map(({ name, label, placeholder, step }) => (
                <div key={name} className="form-group">
                  <label className="form-label">{label}</label>
                  <input
                    {...vitalsForm.register(name as any, { valueAsNumber: true })}
                    type="number"
                    step={step}
                    className="form-input"
                    placeholder={placeholder}
                  />
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={back}><ChevronLeft size={16} /> Back</button>
                <button type="submit" className="btn btn-primary">Save & Continue <ChevronRight size={16} /></button>
              </div>
            </form>
          </div>
        )}

        {/* ── Step 3: Clinical ── */}
        {currentStep === 'clinical' && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Clinical Information</h3>
            <form onSubmit={handleClinical} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Chief Complaint *</label>
                <input {...clinForm.register('chief_complaint')} className={`form-input ${clinForm.formState.errors.chief_complaint ? 'error' : ''}`} placeholder="e.g. Productive cough for 3 days with fever" />
                {clinForm.formState.errors.chief_complaint && <span className="form-error">{String(clinForm.formState.errors.chief_complaint.message)}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Symptoms <span style={{ color: 'var(--text-muted)' }}>(comma-separated)</span></label>
                  <input {...clinForm.register('symptoms_raw')} className="form-input" placeholder="cough, fever, dyspnoea" />
                </div>
                <div className="form-group">
                  <label className="form-label">Symptom Duration</label>
                  <input {...clinForm.register('symptom_duration')} className="form-input" placeholder="3 days" />
                </div>
                <div className="form-group">
                  <label className="form-label">Existing Conditions</label>
                  <input {...clinForm.register('conditions_raw')} className="form-input" placeholder="diabetes, hypertension" />
                </div>
                <div className="form-group">
                  <label className="form-label">Current Medications</label>
                  <input {...clinForm.register('medications_raw')} className="form-input" placeholder="metformin 500mg" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Clinical Notes</label>
                <textarea {...clinForm.register('clinical_notes')} className="form-textarea" placeholder="Additional clinical observations..." />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-secondary" onClick={back}><ChevronLeft size={16} /> Back</button>
                <button type="submit" className="btn btn-primary">Save & Continue <ChevronRight size={16} /></button>
              </div>
            </form>
          </div>
        )}

        {/* ── Step 4: X-Ray Upload ── */}
        {currentStep === 'xray' && (
          <div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>Chest X-Ray Upload</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Upload a PNG or JPG chest X-ray image (max 10MB). Ensure the image is properly oriented PA or AP view.
            </p>
            {!xrayPreview ? (
              <div
                {...getRootProps()}
                style={{
                  border: `2px dashed ${isDragActive ? 'var(--accent-blue)' : 'var(--border-mid)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isDragActive ? 'var(--accent-blue-dim)' : 'var(--glass-low)',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <input {...getInputProps()} />
                <Upload size={40} color={isDragActive ? 'var(--accent-blue)' : 'var(--text-muted)'} style={{ margin: '0 auto 1rem' }} />
                <p style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  {isDragActive ? 'Drop the X-ray here' : 'Drag & drop or click to select'}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>PNG, JPG, JPEG — max 10MB</p>
              </div>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block', width: '100%', textAlign: 'center' }}>
                <img src={xrayPreview} alt="X-ray preview" style={{ maxHeight: 340, maxWidth: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-mid)' }} />
                <button
                  onClick={() => { setXrayFile(null); setXrayPreview(null); }}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
                >
                  <X size={14} />
                </button>
                <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{xrayFile?.name} · {((xrayFile?.size ?? 0) / 1024).toFixed(0)} KB</p>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={back}><ChevronLeft size={16} /> Back</button>
              <button className="btn btn-primary" onClick={handleXray} disabled={!xrayFile}>
                Upload & Continue <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Analyse ── */}
        {currentStep === 'analysis' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Ready for AI Analysis</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                The AI will analyse the chest X-ray using DenseNet121, generate a Grad-CAM heatmap,
                and produce a clinical explanation.
              </p>
            </div>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '2rem', textAlign: 'left' }}>
              {[
                { label: 'Patient',    value: wf.patient?.full_name ?? '—' },
                { label: 'Patient ID', value: wf.patient?.patient_id ?? '—' },
                { label: 'Assessment', value: wf.assessmentId ? '✓ Saved' : '—' },
                { label: 'X-Ray',      value: wf.imageId ? '✓ Uploaded' : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '0.75rem', background: 'var(--glass-low)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{label}</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </div>
            {analysisError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--accent-red)', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                <AlertCircle size={16} /> {analysisError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-secondary" onClick={back} disabled={analysing}><ChevronLeft size={16} /> Back</button>
              <button className="btn btn-primary btn-lg" onClick={handleAnalyse} disabled={analysing}>
                {analysing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {analysing ? 'Analysing…' : '🧠 Run AI Analysis'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
