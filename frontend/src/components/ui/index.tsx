// components/ui/index.tsx — Reusable atomic UI components

import React from 'react';
import { clsx } from 'clsx';

// ── Card ──────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}
export function Card({ children, className, elevated, style, onClick }: CardProps) {
  return (
    <div
      className={clsx(elevated ? 'glass-card-elevated' : 'glass-card', className)}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
interface SpinnerProps { size?: number; }
export function Spinner({ size = 20 }: SpinnerProps) {
  return (
    <div
      className="spinner"
      style={{ width: size, height: size, borderWidth: size < 24 ? 2 : 3 }}
    />
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
type BadgeVariant = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';
interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  style?: React.CSSProperties;
}
export function Badge({ children, variant = 'blue', style }: BadgeProps) {
  return (
    <span className={`badge badge-${variant}`} style={style}>
      {children}
    </span>
  );
}

// ── Severity Badge ────────────────────────────────────────────────────────────
export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, BadgeVariant> = {
    Low: 'green', Moderate: 'amber', High: 'red', Critical: 'red',
  };
  return <Badge variant={map[severity] ?? 'gray'}>{severity}</Badge>;
}

// ── Confidence Bar ────────────────────────────────────────────────────────────
interface ConfidenceBarProps {
  value: number;    // 0–1
  color?: string;
  animated?: boolean;
}
export function ConfidenceBar({ value, color, animated = true }: ConfidenceBarProps) {
  return (
    <div className="confidence-bar">
      <div
        className="confidence-bar-fill"
        style={{
          width: `${Math.min(value * 100, 100)}%`,
          background: color
            ? `linear-gradient(90deg, ${color}, ${color}aa)`
            : undefined,
          transition: animated ? 'width 0.8s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
        }}
      />
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
      <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', opacity: 0.5 }}>
        {icon}
      </div>
      <h4 style={{ color: 'var(--text-secondary)', marginBottom: description ? '0.4rem' : 0 }}>
        {title}
      </h4>
      {description && (
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: action ? '1.25rem' : 0 }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="divider" />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────
type AlertType = 'info' | 'success' | 'warning' | 'error';
interface AlertProps {
  type?: AlertType;
  title?: string;
  children: React.ReactNode;
}
const ALERT_STYLES: Record<AlertType, { bg: string; border: string; color: string; icon: string }> = {
  info:    { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  color: '#60A5FA', icon: 'ℹ️' },
  success: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  color: '#34D399', icon: '✓' },
  warning: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  color: '#FCD34D', icon: '⚠️' },
  error:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   color: '#F87171', icon: '✕' },
};
export function Alert({ type = 'info', title, children }: AlertProps) {
  const s = ALERT_STYLES[type];
  return (
    <div style={{
      padding: '0.875rem 1rem',
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 'var(--radius-md)',
      fontSize: '0.875rem',
      lineHeight: 1.6,
    }}>
      {title && (
        <div style={{ fontWeight: 600, color: s.color, marginBottom: '0.35rem' }}>
          {s.icon} {title}
        </div>
      )}
      <div style={{ color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color?: string;
  trend?: string;
}
export function StatCard({ label, value, icon, color = 'var(--accent-blue)', trend }: StatCardProps) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {trend && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
          {trend}
        </div>
      )}
    </div>
  );
}
