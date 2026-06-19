// pages/admin/ModelManagementPage.tsx
import { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle2, XCircle, Cpu, Power, PowerOff, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/utils/helpers';
import { modelApi } from '@/services/api';
import type { AIModel } from '@/types';
import { format } from 'date-fns';

export default function ModelManagementPage() {
  const [models, setModels]       = useState<AIModel[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: '', version: '1.0.0', description: '', disease_classes: 'Normal,Pneumonia,COVID-19,Tuberculosis', architecture: 'DenseNet121', input_size: '224' });

  const load = () => modelApi.list().then(r => setModels(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error('Select a model file first');
    if (!form.name || !form.version) return toast.error('Name and version required');

    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', form.name);
    fd.append('version', form.version);
    fd.append('description', form.description);
    fd.append('architecture', form.architecture);
    fd.append('input_size', String(parseInt(form.input_size)));
    const classes = JSON.stringify(form.disease_classes.split(',').map(s => s.trim()).filter(Boolean));
    fd.append('disease_classes', classes);

    try {
      const res = await modelApi.upload(fd);
      toast.success(res.data.is_validated ? 'Model uploaded and validated ✓' : `Uploaded (validation: ${res.data.validation_log})`);
      setForm({ name: '', version: '1.0.0', description: '', disease_classes: 'Normal,Pneumonia,COVID-19,Tuberculosis', architecture: 'DenseNet121', input_size: '224' });
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await modelApi.activate(id);
      toast.success('Model activated');
      load();
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await modelApi.deactivate(id);
      toast.success('Model deactivated');
      load();
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    }
  };

  return (
    <div className="page-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <div>
        <h2 style={{ marginBottom: '0.25rem' }}>AI Model Management</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Upload, validate, and activate DenseNet121 models. Only one model may be active at a time.</p>
      </div>

      {/* Upload form */}
      <div className="glass-card" style={{ padding: '1.75rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Upload size={16} color="var(--accent-blue)" /> Upload New Model
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Model Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Pulmonary DenseNet v1" />
          </div>
          <div className="form-group">
            <label className="form-label">Version *</label>
            <input className="form-input" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="1.0.0" />
          </div>
          <div className="form-group">
            <label className="form-label">Architecture</label>
            <select className="form-select" value={form.architecture} onChange={e => setForm(f => ({ ...f, architecture: e.target.value }))}>
              <option value="DenseNet121">DenseNet121</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Input Size (px)</label>
            <input className="form-input" type="number" value={form.input_size} onChange={e => setForm(f => ({ ...f, input_size: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Disease Classes <span style={{ color: 'var(--text-muted)' }}>(comma-separated, order must match model output)</span></label>
            <input className="form-input" value={form.disease_classes} onChange={e => setForm(f => ({ ...f, disease_classes: e.target.value }))} placeholder="Normal,Pneumonia,COVID-19,Tuberculosis" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes about this model" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Model File (.pth or .pkl) *</label>
            <input ref={fileRef} type="file" accept=".pth,.pkl" className="form-input" style={{ cursor: 'pointer' }} />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={handleUpload} disabled={uploading}>
          {uploading ? <span className="spinner" /> : <Upload size={15} />}
          {uploading ? 'Uploading & Validating…' : 'Upload Model'}
        </button>
      </div>

      {/* Model list */}
      <div>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Registered Models</h3>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
        ) : models.length === 0 ? (
          <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Cpu size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
            <p>No models uploaded yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {models.map(m => (
              <div key={m.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', borderColor: m.is_active ? 'rgba(16,185,129,0.3)' : undefined, background: m.is_active ? 'rgba(16,185,129,0.04)' : undefined }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: m.is_active ? 'rgba(16,185,129,0.15)' : 'var(--glass-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Cpu size={18} color={m.is_active ? 'var(--accent-emerald)' : 'var(--text-muted)'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {m.name}
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--glass-low)', padding: '1px 6px', borderRadius: 4 }}>v{m.version}</span>
                    {m.is_active && <span className="badge badge-green">Active</span>}
                    {!m.is_validated && <span className="badge badge-red">Invalid</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span>{m.architecture}</span>
                    <span>Classes: {Array.isArray(m.disease_classes) ? m.disease_classes.join(', ') : m.disease_classes}</span>
                    {m.file_size_bytes && <span>{(m.file_size_bytes / (1024*1024)).toFixed(1)} MB</span>}
                    <span>{format(new Date(m.created_at), 'd MMM yyyy')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  {!m.is_active && m.is_validated && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleActivate(m.id)}>
                      <Power size={13} /> Activate
                    </button>
                  )}
                  {m.is_active && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(m.id)}>
                      <PowerOff size={13} /> Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
