import { ArthaMarkVariant } from './ArthaMark';

export interface AccentPreset {
  id: string;
  name: string;
  accent: string;
  accentDim: string;
}

// Curated set, not a free color picker — each entry is pre-verified for
// contrast against the app's real sidebar background (--bg-secondary,
// #0d111d), so every option stays legible. 'violet' matches today's existing
// look and is the default, so installing this feature is a no-visual-change
// upgrade for existing users; the rest are opt-in.
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'violet', name: 'Violet (Default)', accent: '#a78bfa', accentDim: '#8b5cf6' },
  { id: 'brass', name: 'Brass', accent: '#cdaa6c', accentDim: '#a4844f' },
  { id: 'sage', name: 'Sage', accent: '#8fa389', accentDim: '#7a8b76' },
  { id: 'mono', name: 'Mono', accent: '#eae6da', accentDim: '#a3a3a3' },
  { id: 'terracotta', name: 'Terracotta', accent: '#d99a76', accentDim: '#a25f3f' },
];

export const MARK_LABELS: Record<ArthaMarkVariant, string> = {
  'balanced-a': 'The Balanced A',
  vault: 'The Vault Mark',
  'ledger-rule': 'The Ledger Rule',
};

export const MARK_DESCRIPTIONS: Record<ArthaMarkVariant, string> = {
  'balanced-a': 'An "A" with a scale-beam crossbar — reads as accounting, not growth.',
  vault: 'A sealed vault door with the "A" cut in negative space. Stays legible smallest.',
  'ledger-rule': 'An "A" built from two ruled ledger lines meeting at a peak.',
};

export const MARK_VARIANTS: ArthaMarkVariant[] = ['balanced-a', 'vault', 'ledger-rule'];
