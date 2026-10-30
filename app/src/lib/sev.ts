/** Hotspot severity styles — a neutral module so server pages and client components share them. */

export type Sev = 'critical' | 'significant' | 'moderate' | 'stable' | 'improving' | 'insufficient';
export const SEV_META: Record<Sev, { label: string; tile: string; dot: string; text: string }> = {
  critical: { label: 'Critical decline', tile: 'bg-crit text-white border-crit', dot: 'bg-crit', text: 'text-crit' },
  significant: { label: 'Significant decline', tile: 'bg-[#e0763c] text-white border-[#c9622b]', dot: 'bg-[#e0763c]', text: 'text-[#b4541f]' },
  moderate: { label: 'Moderate concern', tile: 'bg-[#f6d27a] text-ink border-[#e3b94f]', dot: 'bg-[#f2c14e]', text: 'text-warn' },
  stable: { label: 'Stable', tile: 'bg-[#e6ecf3] text-ink border-[#cfd9e6]', dot: 'bg-[#cfd9e6]', text: 'text-ink-soft' },
  improving: { label: 'Improving', tile: 'bg-brand text-white border-brand-dark', dot: 'bg-brand', text: 'text-brand' },
  insufficient: { label: 'Insufficient data', tile: 'bg-[repeating-linear-gradient(45deg,#f3efe6_0_5px,#ffffff_5px_10px)] text-ink-soft border-line-strong border-dashed', dot: 'bg-paper-deep', text: 'text-ink-faint' },
};
