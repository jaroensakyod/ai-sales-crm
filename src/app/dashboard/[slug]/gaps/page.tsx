import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listOpenGaps } from "@/db/repositories/gaps";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { hasGeminiApiKey } from "@/lib/env";

import { answerGapAction } from "../../actions";

export const dynamic = "force-dynamic";

/** Content only (no Shell) — rendered inside the combined /ai-tools page. */
export async function GapsSection({
  slug,
  ok,
  error,
}: {
  slug: string;
  ok?: string;
  error?: string;
}) {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) return null;

  const gaps = await listOpenGaps(db, tenant.id);

  return (
    <>
      <h1>Knowledge Gap Inbox</h1>
        <p className="muted">
          คำถามที่ AI ตอบไม่ได้ ตอบครั้งเดียวแล้วระบบจะเรียนรู้ (เพิ่มเข้าคลังความรู้อัตโนมัติ)
        </p>
        {ok ? <p className="ok">บันทึกคำตอบและเพิ่มเข้าคลังความรู้แล้ว</p> : null}
        {error === "nokey" ? (
          <p className="error">ต้องตั้งค่า GEMINI_API_KEY ก่อนจึงจะตอบได้</p>
        ) : error ? (
          <p className="error">เกิดข้อผิดพลาด ลองใหม่</p>
        ) : null}

        {gaps.length === 0 ? (
          <p className="muted">ไม่มีคำถามค้าง 🎉</p>
        ) : (
          gaps.map((g) => (
            <form key={g.id} action={answerGapAction} className="card" style={{ marginBottom: 14 }}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="gapId" value={g.id} />
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                ❓ {g.question}
              </div>
              <textarea
                name="answer"
                rows={3}
                required
                placeholder="พิมพ์คำตอบที่ถูกต้อง…"
              />
              <button
                type="submit"
                disabled={!hasGeminiApiKey()}
                style={{ marginTop: 10 }}
              >
                บันทึก + สอน AI
              </button>
            </form>
          ))
        )}
    </>
  );
}

/** Old standalone route → now merged into /ai-tools. */
export default async function GapsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/dashboard/${slug}/ai-tools`);
}
