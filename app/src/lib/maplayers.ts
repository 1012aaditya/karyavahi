/**
 * Severity colours and labels shared by the map component (client) and pages (server).
 * Every map label also carries its value as text, so no status is carried by colour alone;
 * "insufficient data" is additionally drawn with a hatch pattern.
 */
import { SEVERITY } from './tokens';

/** Map fills from the shared severity ramp. MapLibre needs literal colours, not CSS variables. */
export const SEVERITY_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(SEVERITY).map(([k, v]) => [k, v.fill]),
);
export const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical decline', significant: 'Significant decline', moderate: 'Moderate concern', stable: 'Stable', improving: 'Improving', insufficient: 'Insufficient data',
};
export const SEVERITY_LABEL_HI: Record<string, string> = {
  critical: 'गंभीर गिरावट', significant: 'उल्लेखनीय गिरावट', moderate: 'मध्यम चिंता', stable: 'स्थिर', improving: 'सुधार', insufficient: 'अपर्याप्त डेटा',
};
/** The severity label in the page language. */
export const severityLabel = (s: string, lang: 'en' | 'hi' = 'en'): string => (lang === 'hi' ? SEVERITY_LABEL_HI[s] : SEVERITY_LABEL[s]) ?? s;
