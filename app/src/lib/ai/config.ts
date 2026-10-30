import 'server-only';

/**
 * AI provider configuration. Everything model-specific is read from the environment here and
 * nowhere else, so the provider and model can be swapped without touching the orchestration.
 *
 *   ANTHROPIC_API_KEY        required for the AI features (server-side only — never NEXT_PUBLIC_)
 *   KARYAVAHI_AI_MODEL       optional, defaults to claude-opus-5-5
 *   KARYAVAHI_AI_EFFORT      optional, low | medium | high (default medium)
 *   KARYAVAHI_AI_FALLBACKS   optional, "off" disables server-side refusal fallback
 *
 * When no key is configured the AI features say so plainly. There is no canned fallback
 * that pretends to be a live model.
 */

export const DEFAULT_MODEL = 'claude-opus-5-5';

export type Effort = 'low' | 'medium' | 'high';

export interface AiStatus {
  configured: boolean;
  provider: 'anthropic';
  model: string;
  effort: Effort;
  fallbacks: boolean;
  reason?: string;
}

export function aiStatus(): AiStatus {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.KARYAVAHI_AI_MODEL?.trim() || DEFAULT_MODEL;
  const e = process.env.KARYAVAHI_AI_EFFORT?.trim();
  const effort: Effort = e === 'low' || e === 'high' ? e : 'medium';
  const fallbacks = process.env.KARYAVAHI_AI_FALLBACKS?.trim().toLowerCase() !== 'off';
  return {
    configured: Boolean(key),
    provider: 'anthropic',
    model,
    effort,
    fallbacks,
    reason: key ? undefined : 'ANTHROPIC_API_KEY is not set on the server.',
  };
}
