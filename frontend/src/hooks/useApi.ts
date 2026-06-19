// hooks/useApi.ts — Generic data fetching hook with loading/error state

import { useCallback, useEffect, useRef, useState } from 'react';
import { extractErrorMessage } from '@/utils/helpers';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic hook for API calls.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(() => patientApi.list());
 */
export function useApi<T>(
  fetcher: () => Promise<{ data: T }>,
  deps: React.DependencyList = [],
): UseApiState<T> {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const mountedRef             = useRef(true);
  const countRef               = useRef(0);

  const fetch = useCallback(async () => {
    const id = ++countRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      if (mountedRef.current && id === countRef.current) {
        setData(res.data);
      }
    } catch (err: any) {
      if (mountedRef.current && id === countRef.current) {
        setError(extractErrorMessage(err));
      }
    } finally {
      if (mountedRef.current && id === countRef.current) {
        setLoading(false);
      }
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    fetch();
    return () => { mountedRef.current = false; };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ── Debounce hook ──────────────────────────────────────────────────────────────
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── LocalStorage hook ─────────────────────────────────────────────────────────
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((v: T) => T)) => void] {
  const [stored, setStored] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((v: T) => T)) => {
    setStored(prev => {
      const next = typeof value === 'function' ? (value as (v: T) => T)(prev) : value;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  return [stored, setValue];
}

// ── Title hook ────────────────────────────────────────────────────────────────
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — CDSS`;
    return () => { document.title = 'CDSS — Clinical Decision Support'; };
  }, [title]);
}
