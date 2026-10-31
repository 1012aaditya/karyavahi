/**
 * Map layer definitions shared by the map component (client) and pages (server).
 * Each layer pairs a colour ramp with a text value on every label, so no status is carried by
 * colour alone; "insufficient data" is additionally drawn with a hatch pattern on every layer.
 */

export type LayerKey = 'learning' | 'critical' | 'complaints' | 'overdue' | 'delivery' | 'improvement' | 'insufficient';

export interface LayerDef {
  key: LayerKey;
  label: string;
  short: string;
  description: string;
  legend: { color: string; label: string; hatch?: boolean }[];
}

export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#b42318', significant: '#e0763c', moderate: '#f2c14e', stable: '#dfe6ee', improving: '#0f766e', insufficient: '#f3efe6',
};
export const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical decline', significant: 'Significant decline', moderate: 'Moderate concern', stable: 'Stable', improving: 'Improving', insufficient: 'Insufficient data',
};

export const LAYERS: LayerDef[] = [
  { key: 'learning', label: 'Learning gaps', short: 'Learning', description: 'Worst class × competency change vs district (pp), with a sample-size gate.',
    legend: [
      { color: SEVERITY_COLORS.critical, label: SEVERITY_LABEL.critical },
      { color: SEVERITY_COLORS.significant, label: SEVERITY_LABEL.significant },
      { color: SEVERITY_COLORS.moderate, label: SEVERITY_LABEL.moderate },
      { color: SEVERITY_COLORS.stable, label: SEVERITY_LABEL.stable },
      { color: SEVERITY_COLORS.improving, label: SEVERITY_LABEL.improving },
      { color: SEVERITY_COLORS.insufficient, label: SEVERITY_LABEL.insufficient, hatch: true },
    ] },
  { key: 'critical', label: 'Critical cases', short: 'Critical', description: 'Open cases marked critical.',
    legend: [{ color: '#f4f1ea', label: 'None' }, { color: '#f4b4ad', label: '1' }, { color: '#e2574c', label: '2–3' }, { color: '#9b1c13', label: '4+' }] },
  { key: 'complaints', label: 'Open complaints', short: 'Complaints', description: 'Open complaints you are allowed to see.',
    legend: [{ color: '#f4f1ea', label: 'None' }, { color: '#d9cff2', label: '1' }, { color: '#9a85d6', label: '2–3' }, { color: '#5b4696', label: '4+' }] },
  { key: 'overdue', label: 'Overdue actions', short: 'Overdue', description: 'Tasks past their due date and not submitted.',
    legend: [{ color: '#f4f1ea', label: 'None' }, { color: '#fbe3ac', label: '1–2' }, { color: '#f0a83a', label: '3–5' }, { color: '#9a5b07', label: '6+' }] },
  { key: 'delivery', label: 'Intervention delivery', short: 'Delivery', description: 'Share of tasks on open cases with verified proof.',
    legend: [{ color: '#f3efe6', label: 'No open work', hatch: true }, { color: '#fde7c4', label: '< 50%' }, { color: '#9fd8cc', label: '50–79%' }, { color: '#0f766e', label: '80%+' }] },
  { key: 'improvement', label: 'Verified improvement', short: 'Improved', description: 'Cases closed on a verified learning gain.',
    legend: [{ color: '#f4f1ea', label: 'None' }, { color: '#bfe5cf', label: '1' }, { color: '#55b07f', label: '2–3' }, { color: '#18794e', label: '4+' }] },
  { key: 'insufficient', label: 'Insufficient or missing data', short: 'Data gaps', description: 'Areas where too few students were assessed to judge. Unknown, not stable.',
    legend: [{ color: '#77819a', label: 'Insufficient data', hatch: true }, { color: '#f4f1ea', label: 'Enough data' }] },
];

export const layerDef = (k: string) => LAYERS.find((l) => l.key === k) ?? LAYERS[0];

/** The text shown on a unit's label for a layer — the non-colour channel. */
export function labelValue(layer: LayerKey, p: Record<string, unknown>): string {
  const n = (k: string) => Number(p[k] ?? 0);
  switch (layer) {
    case 'learning': return p.severity === 'insufficient' ? 'n/a' : p.relPp === null || p.relPp === undefined ? '—' : `${Number(p.relPp) > 0 ? '+' : Number(p.relPp) < 0 ? '−' : ''}${Math.abs(Number(p.relPp)).toFixed(1)} pp`;
    case 'critical': return `${n('critical')} critical`;
    case 'complaints': return `${n('complaints')} open`;
    case 'overdue': return `${n('overdue')} overdue`;
    case 'delivery': return p.delivery === null || p.delivery === undefined ? 'no work' : `${p.delivery}% verified`;
    case 'improvement': return `${n('improved')} improved`;
    case 'insufficient': return p.severity === 'insufficient' ? 'insufficient' : 'ok';
  }
}
