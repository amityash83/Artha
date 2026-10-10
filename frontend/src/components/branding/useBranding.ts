import { useState, useEffect, useCallback } from 'react';
import { ArthaMarkVariant } from './ArthaMark';
import { ACCENT_PRESETS } from './presets';

const STORAGE_KEY = 'artha:branding';
const CHANGE_EVENT = 'artha:branding-changed';

interface BrandingPref {
  variant: ArthaMarkVariant;
  accentId: string;
}

// 'violet' matches the app's existing look today, so this feature is a
// no-visual-change default — brass/sage/etc. are opt-in via Settings > Branding.
const DEFAULT_PREF: BrandingPref = { variant: 'vault', accentId: 'violet' };

function readPref(): BrandingPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREF;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREF, ...parsed };
  } catch {
    return DEFAULT_PREF;
  }
}

// Purely cosmetic, single-machine, zero-cost-if-lost preference — stored in
// localStorage rather than a DB table/API route (contrast with ai_settings,
// which holds a secret that must survive backup/restore). Two independent
// consumers (App.tsx sidebar, Settings.tsx picker) each call this hook; a
// custom window event keeps them in sync without needing a React Context.
export function useBranding() {
  const [pref, setPref] = useState<BrandingPref>(readPref);

  useEffect(() => {
    const handleChange = () => setPref(readPref());
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, []);

  const update = useCallback((next: Partial<BrandingPref>) => {
    setPref((prev) => {
      const merged = { ...prev, ...next };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return merged;
    });
  }, []);

  const accent = ACCENT_PRESETS.find((p) => p.id === pref.accentId) || ACCENT_PRESETS[0];

  return {
    variant: pref.variant,
    accentId: pref.accentId,
    accentColor: accent.accent,
    setVariant: (v: ArthaMarkVariant) => update({ variant: v }),
    setAccentId: (id: string) => update({ accentId: id }),
  };
}
