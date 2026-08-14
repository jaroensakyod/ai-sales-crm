import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getConversationThread } from "@/db/repositories/analytics";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import { Shell } from "../../_components/shell";

export const dynamic = "force-dynamic";

function when(d: Date | null) {
  return d ? new Date(d).toLocaleString("th-TH") : "";
}

export default async function InboxThread({
  params,
}: {
  params: Promise<{ slug: string; conversationId: string }>;
}) {
  const { slug, conversationId } = await params;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const thread = await getConversationThread(db, tenant.id, conversationId);
  if (!thread) notFound();

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <p className="muted" style={{ marginBottom: 4 }}>
        <Link href={`/dashboard/${slug}`}>← กลับหน้าภาพรวม</Link>
      </p>
      <h1>
        บทสนทนา{" "}
        <span className={`badge ${thread.conversation.status.toLowerCase()}`}>
          {thread.conversation.status}
        </span>
      </h1>

      <div className="chat">
          {thread.messages.map((m) => (
            <div
              key={m.id}
              className={`msg ${m.direction === "INBOUND" ? "in" : "out"}`}
            >
              {m.body}
              <span className="meta">
                {m.direction === "INBOUND" ? "ลูกค้า" : "ร้าน/บอท"} ·{" "}
                {when(m.sentAt ?? m.createdAt)}
              </span>
            </div>
          ))}
        {thread.messages.length === 0 ? (
          <p className="muted">ยังไม่มีข้อความ</p>
        ) : null}
      </div>
    </Shell>
  );
}
