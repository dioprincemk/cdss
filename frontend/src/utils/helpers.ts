// utils/helpers.ts — Shared utility functions

import { format, formatDistanceToNow } from 'date-fns';

// ── Date formatting ───────────────────────────────────────────────────────────
export function formatDate(dateStr: string | Date, pattern = 'd MMM yyyy'): string {
  try {
    return format(new Date(dateStr), pattern);
  } catch {
    return '—';
  }
}

export function formatDateTime(dateStr: string | Date): string {
  try {
    return format(new Date(dateStr), 'd MMM yyyy, HH:mm');
  } catch {
    return '—';
  }
}

export function timeAgo(dateStr: string | Date): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

// ── Number formatting ─────────────────────────────────────────────────────────
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Age calculation ───────────────────────────────────────────────────────────
export function calculateAge(dateOfBirth: string | Date): number {
  const dob   = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ── BMI calculation ───────────────────────────────────────────────────────────
export function calculateBMI(weightKg: number, heightCm: number): number {
  if (!weightKg || !heightCm || heightCm <= 0) return 0;
  return parseFloat((weightKg / ((heightCm / 100) ** 2)).toFixed(1));
}

export function getBMICategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: 'var(--accent-amber)' };
  if (bmi < 25.0) return { label: 'Normal',      color: 'var(--accent-emerald)' };
  if (bmi < 30.0) return { label: 'Overweight',  color: 'var(--accent-amber)' };
  return             { label: 'Obese',         color: 'var(--accent-red)' };
}

// ── Vital sign interpretation ─────────────────────────────────────────────────
export function interpretSpO2(spo2: number): { label: string; color: string } {
  if (spo2 >= 95) return { label: 'Normal',   color: 'var(--accent-emerald)' };
  if (spo2 >= 90) return { label: 'Low',      color: 'var(--accent-amber)' };
  return               { label: 'Critical', color: 'var(--accent-red)' };
}

export function interpretHeartRate(bpm: number): { label: string; color: string } {
  if (bpm < 60)  return { label: 'Bradycardia', color: 'var(--accent-amber)' };
  if (bpm <= 100) return { label: 'Normal',      color: 'var(--accent-emerald)' };
  return               { label: 'Tachycardia', color: 'var(--accent-red)' };
}

// ── Error message extraction ──────────────────────────────────────────────────
export function extractErrorMessage(err: unknown): string {
  if (!err) return 'An unknown error occurred';
  const e = err as any;
  const detail = e?.response?.data?.detail ?? e?.response?.data?.message;

  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors are an array of objects with 'msg'
    const parts = detail.map((d: any) => d?.msg ?? (typeof d === 'string' ? d : JSON.stringify(d)));
    return parts.join('; ');
  }
  if (detail && typeof detail === 'object') {
    // Try common fields
    return detail.message ?? detail.detail ?? JSON.stringify(detail);
  }

  return e?.message ?? 'Request failed';
}

// ── Confidence colour ─────────────────────────────────────────────────────────
export function confidenceToColor(confidence: number): string {
  if (confidence >= 0.80) return 'var(--accent-red)';
  if (confidence >= 0.60) return 'var(--accent-amber)';
  return 'var(--accent-emerald)';
}

// ── Truncate text ─────────────────────────────────────────────────────────────
export function truncate(str: string, maxLen = 50): string {
  return str.length <= maxLen ? str : `${str.slice(0, maxLen)}…`;
}

// ── Generate patient ID suggestion ───────────────────────────────────────────
export function generatePatientId(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `P-${year}-${rand}`;
}
