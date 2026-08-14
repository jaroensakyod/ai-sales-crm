import type { DbClient } from "@/db/client";
import { getGap, markGapAnswered } from "@/db/repositories/gaps";
import type { EmbedFn } from "@/features/ai/embeddings";
import { ingestKnowledge } from "@/features/ai/rag";

/**
 * Answer a knowledge gap: ingest the Q&A into the RAG store (so Level 2 can
 * handle it next time) and mark the gap ANSWERED. The "answer once, get smarter"
 * loop from docs/01.
 */
export async function answerGap(
  db: DbClient,
  tenantId: string,
  gapId: string,
  answer: string,
  deps: { embed?: EmbedFn; answeredByUserId?: string } = {},
): Promise<boolean> {
  const gap = await getGap(db, tenantId, gapId);
  if (!gap) return false;

  await ingestKnowledge(
    db,
    tenantId,
    {
      title: gap.question.slice(0, 80),
      text: `คำถาม: ${gap.question}\nคำตอบ: ${answer}`,
    },
    { embed: deps.embed },
  );
  await markGapAnswered(db, tenantId, gapId, answer, deps.answeredByUserId);
  return true;
}
