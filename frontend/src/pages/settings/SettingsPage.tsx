// pages/settings/SettingsPage.tsx
import { useState } from 'react';
import { Sun, Moon, User, Shield, Info } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const { user } = useAuthStore();

  return (
    <div className="page-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 700 }}>
      <div>
        <h2 style={{ marginBottom: '0.25rem' }}>Settings</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Application preferences and account information</p>
      </div>

      {/* Appearance */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sun size={16} color="var(--accent-blue)" /> Appearance
        </h3>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {(['dark', 'light'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={theme === t ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ flex: 1, gap: '0.5rem' }}
            >
              {t === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              {t === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </button>
          ))}
        </div>
      </div>

      {/* Account info */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <User size={16} color="var(--accent-blue)" /> Account Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Full Name',       value: user?.full_name },
            { label: 'Email',           value: user?.email },
            { label: 'Role',            value: user?.role },
            { label: 'Department',      value: user?.department ?? 'Not set' },
            { label: 'Medical License', value: user?.medical_license ?? 'Not set' },
            { label: 'Account Status',  value: user?.is_active ? 'Active' : 'Inactive' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem', fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, textTransform: label === 'Role' ? 'capitalize' : undefined }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* System info */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Info size={16} color="var(--accent-blue)" /> System Information
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
          {[
            ['Application',  'Clinical Decision Support System (CDSS)'],
            ['Version',      '1.0.0'],
            ['AI Framework', 'PyTorch + DenseNet121'],
            ['Explainability', 'Gradient-weighted Class Activation Mapping (Grad-CAM)'],
            ['Backend',      'FastAPI + PostgreSQL'],
            ['Frontend',     'React + TypeScript + Vite'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 130 }}>{k}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ padding: '1rem', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--accent-blue)' }}>⚕️ Clinical Disclaimer</strong><br />
        This system is intended to support clinical decision-making and does not replace professional medical judgment. All AI-generated analyses must be reviewed by a qualified healthcare provider. This software is developed for academic and research purposes.
      </div>
    </div>
  );
}
