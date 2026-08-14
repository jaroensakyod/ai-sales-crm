/**
 * Graceful AI soft-cap (Phase 2, docs/02-plan.md). When a tenant passes its
 * monthly AI budget we degrade cost — never block the customer mid-conversation.
 *
 *   spend < cap        → normal      (use the escalation model)
 *   cap ≤ spend < 2·cap → downgraded  (use the cheaper default model)
 *   spend ≥ 2·cap       → l3_disabled (skip Level 3; L1 rules + L2 RAG still
 *                                      answer, the rest hand off to a human)
 *
 * A null/zero cap means unlimited (default) — the marketed "ไม่จำกัดข้อความ",
 * with this cap as an internal safety net only (docs/04-risks.md).
 */
export type BudgetTier = "normal" | "downgraded" | "l3_disabled";

export function resolveBudgetTier(args: {
  monthlySpendUsd: number;
  softCapUsd: number | null;
}): BudgetTier {
  const cap = args.softCapUsd;
  if (cap == null || cap <= 0) return "normal";
  if (args.monthlySpendUsd < cap) return "normal";
  if (args.monthlySpendUsd < cap * 2) return "downgraded";
  return "l3_disabled";
}
