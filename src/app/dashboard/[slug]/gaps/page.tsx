import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listOpenGaps } from "@/db/repositories/gaps";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";
import { hasGeminiApiKey } from "@/lib/env";

import { answerGapAction } from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

export default async function GapsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const gaps = await listOpenGaps(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
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
    </Shell>
  );
}
