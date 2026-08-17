import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getConversationThread } from "@/db/repositories/analytics";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import {
  releaseConversationAction,
  replyInboxAction,
  takeOverConversationAction,
} from "../../../actions";
import { Shell } from "../../_components/shell";

export const dynamic = "force-dynamic";

function when(d: Date | null) {
  return d ? new Date(d).toLocaleString("th-TH") : "";
}

export default async function InboxThread({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; conversationId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug, conversationId } = await params;
  const { ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const thread = await getConversationThread(db, tenant.id, conversationId);
  if (!thread) notFound();
  const handling = thread.conversation.status === "HANDOFF";

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <p className="muted" style={{ marginBottom: 4 }}>
        <Link href={`/dashboard/${slug}`}>← กลับหน้าภาพรวม</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>
          บทสนทนา{" "}
          <span className={`badge ${thread.conversation.status.toLowerCase()}`}>
            {thread.conversation.status}
          </span>
        </h1>
        {handling ? (
          <form action={releaseConversationAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <button type="submit" className="ghost sm">
              ให้บอทตอบต่อ
            </button>
          </form>
        ) : (
          <form action={takeOverConversationAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <button type="submit" className="sm">
              รับเรื่องเอง (หยุดบอท)
            </button>
          </form>
        )}
      </div>

      {handling ? (
        <p className="ok" style={{ marginTop: 8 }}>
          🙋 คุณกำลังดูแลแชทนี้ — บอทหยุดตอบชั่วคราวจนกว่าจะกด “ให้บอทตอบต่อ”
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 8 }}>
          บอทกำลังตอบแชทนี้อัตโนมัติ · พิมพ์ตอบด้านล่างหรือกด “รับเรื่องเอง” เพื่อเข้าดูแลเอง
        </p>
      )}
      {ok === "sent" ? <p className="ok">ส่งข้อความแล้ว</p> : null}
      {ok === "released" ? <p className="ok">คืนแชทให้บอทแล้ว</p> : null}
      {error === "send" ? (
        <p className="error">ส่งไม่สำเร็จ — ตรวจการเชื่อมต่อช่องทาง หรือหน้าต่างตอบกลับอาจหมดอายุ</p>
      ) : null}
      {error === "empty" ? <p className="error">พิมพ์ข้อความก่อนส่ง</p> : null}

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

      <form action={replyInboxAction} className="reply-box">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="conversationId" value={conversationId} />
        <textarea
          name="message"
          rows={2}
          placeholder="พิมพ์ข้อความตอบลูกค้า… (กดส่งแล้วบอทจะหยุดตอบให้อัตโนมัติ)"
          style={{ fontFamily: "inherit" }}
        />
        <button type="submit">ส่ง</button>
      </form>
    </Shell>
  );
}
