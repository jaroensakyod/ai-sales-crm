/**
 * Lead scoring (0-100) — pure and deterministic so it's easy to reason about
 * and test. Feeds prioritization in the pipeline (Pro differentiator, docs/01).
 */
export type LeadSignals = {
  messageCount?: number;
  hasOrder?: boolean;
  paidOrder?: boolean;
  openObjections?: number;
};

export function computeLeadScore(signals: LeadSignals): number {
  let score = 0;
  score += Math.min((signals.messageCount ?? 0) * 5, 30); // engagement, capped
  if (signals.hasOrder) score += 30; // intent to buy
  if (signals.paidOrder) score += 40; // actually converted
  score -= (signals.openObjections ?? 0) * 5; // unresolved friction
  return Math.max(0, Math.min(100, score));
}
