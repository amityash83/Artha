import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config';

const DEBOUNCE_MS = 300;

interface Slot<T> {
  key: string;
  data: T | null;
  error: string | null;
}

export interface TaxPostState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True while `data` belongs to an older request than the current inputs. */
  stale: boolean;
}

/**
 * Debounced POST that re-runs whenever `body` changes (compared by JSON). Each new
 * request aborts the previous one. While a newer request is pending, the previous
 * response is still returned but flagged `stale`, so callers can keep it on screen
 * dimmed (see <Freshness>) instead of flashing empty on every keystroke, without it
 * ever passing for the current figures. When disabled, nothing is returned.
 */
export function useTaxPost<T>(path: string, body: unknown, enabled = true): TaxPostState<T> {
  const key = enabled ? `${path}|${JSON.stringify(body)}` : '';
  const [slot, setSlot] = useState<Slot<T>>({ key: '', data: null, error: null });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}${path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: key.slice(path.length + 1), signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.detail ?? `Request failed (${res.status})`);
        setSlot({ key, data: json as T, error: null });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSlot({ key, data: null, error: (e as Error).message });
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [path, key]);

  if (key === '') return { data: null, error: null, loading: false, stale: false };
  const current = slot.key === key;
  return { data: slot.data, error: current ? slot.error : null, loading: !current, stale: !current && slot.data !== null };
}
