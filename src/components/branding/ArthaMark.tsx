import React from 'react';

export type ArthaMarkVariant = 'balanced-a' | 'vault' | 'ledger-rule';

interface ArthaMarkProps {
  variant: ArthaMarkVariant;
  size?: number;
  color?: string;
  wordmark?: boolean;
}

// Each variant is one closed SVG form (no collage of finance-clipart icons),
// drawn to stay legible down to a 16px favicon. Icon shapes share an 88x88
// viewBox; wordmark lockups share a 220x76 viewBox — only the inner path/shape
// data differs per variant, so this is one component with a data switch rather
// than three near-duplicate files that would drift apart on shared tweaks.
const ICON_CONTENT: Record<ArthaMarkVariant, (color: string) => React.ReactNode> = {
  'balanced-a': (color) => (
    <>
      <path
        d="M44 14 L68 70 L58 70 L52 56 L36 56 L30 70 L20 70 Z"
        fill="none" stroke={color} strokeWidth={4.5} strokeLinejoin="round"
      />
      <line x1={30} y1={45} x2={58} y2={45} stroke={color} strokeWidth={4.5} strokeLinecap="round" opacity={0.7} />
      <circle cx={30} cy={45} r={3.4} fill={color} opacity={0.7} />
      <circle cx={58} cy={45} r={3.4} fill={color} opacity={0.7} />
    </>
  ),
  vault: (color) => (
    <>
      <rect x={12} y={12} width={64} height={64} rx={18} fill={color} />
      <path
        d="M44 26 L60 62 L52 62 L47.5 51 L40.5 51 L36 62 L28 62 Z"
        fill="var(--bg-secondary, #0d111d)"
      />
      <circle cx={44} cy={43} r={3.2} fill={color} />
    </>
  ),
  'ledger-rule': (color) => (
    <>
      <path d="M44 16 L64 68" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
      <path d="M44 16 L24 68" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
      <line x1={33} y1={50} x2={55} y2={50} stroke={color} strokeWidth={5} strokeLinecap="round" />
      <circle cx={44} cy={34} r={3.6} fill={color} opacity={0.7} />
    </>
  ),
};

const WORDMARK_CONTENT: Record<ArthaMarkVariant, (color: string) => React.ReactNode> = {
  'balanced-a': (color) => (
    <>
      <path
        d="M28 8 L44 46 L38 46 L34 37 L22 37 L18 46 L12 46 Z"
        fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round"
      />
      <line x1={18.5} y1={30} x2={37.5} y2={30} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.7} />
    </>
  ),
  vault: (color) => (
    <>
      <rect x={8} y={10} width={36} height={36} rx={10} fill={color} />
      <path d="M26 19 L35 40 L31 40 L28.6 34.3 L23.4 34.3 L21 40 L17 40 Z" fill="var(--bg-secondary, #0d111d)" />
      <circle cx={26} cy={27.5} r={1.9} fill={color} />
    </>
  ),
  'ledger-rule': (color) => (
    <>
      <path d="M28 12 L40 44" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" />
      <path d="M28 12 L16 44" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" />
      <line x1={20.5} y1={31} x2={35.5} y2={31} stroke={color} strokeWidth={3.2} strokeLinecap="round" />
    </>
  ),
};

export const ArthaMark: React.FC<ArthaMarkProps> = ({ variant, size = 22, color = 'currentColor', wordmark = false }) => {
  if (wordmark) {
    return (
      <svg width={(size / 22) * 220} height={(size / 22) * 76} viewBox="0 0 220 76" role="img" aria-label="Artha">
        {WORDMARK_CONTENT[variant](color)}
        <text x={58} y={42} fontFamily="'Fraunces', Georgia, serif" fontSize={34} fontWeight={600} fill={color}>rtha</text>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" role="img" aria-label="Artha">
      {ICON_CONTENT[variant](color)}
    </svg>
  );
};
