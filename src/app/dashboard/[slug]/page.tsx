import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import {
  getBotImpact,
  getTenantOverview,
  listRecentConversations,
  listRecentOrders,
} from "@/db/repositories/analytics";
import { getMonthlyAiSpend } from "@/db/repositories/billing";
import { getSubscription } from "@/db/repositories/subscriptions";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";
import { resolveBudgetTier } from "@/features/billing/budget";
import { PLAN_PRICE_THB, type Plan } from "@/features/billing/plans";

import {
  changePlanAction,
  releaseConversationAction,
  takeOverConversationAction,
} from "../actions";

import { Shell } from "./_components/shell";

export const dynamic = "force-dynamic";

function baht(n: number) {
  return `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}
function when(d: Date | null) {
  return d ? new Date(d).toLocaleString("th-TH") : "-";
}
function channelLabel(type: string | null): { label: string; color: string } {
  switch (type) {
    case "LINE":
      return { label: "💬 LINE", color: "#06c755" };
    case "MESSENGER":
      return { label: "f Facebook", color: "#1877f2" };
    case "INSTAGRAM":
      return { label: "📷 Instagram", color: "#e1306c" };
    default:
      return { label: type ?? "-", color: "#888" };
  }
}
function statusClass(s: string) {
  if (s === "PAID" || s === "CLOSED") return "paid";
  if (s === "HANDOFF") return "handoff";
  if (s === "PENDING_PAYMENT") return "pending";
  return "open";
}

export default async function TenantOverview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const [overview, botImpact, conversations, orders, settings, monthlySpend] =
    await Promise.all([
      getTenantOverview(db, tenant.id),
      getBotImpact(db, tenant.id),
      listRecentConversations(db, tenant.id, 10),
      listRecentOrders(db, tenant.id, 10),
      getTenantAiSettings(db, tenant.id),
      getMonthlyAiSpend(db, tenant.id),
    ]);
  // Chat→order close rate (share of conversations that produced an order).
  const chatConversion =
    botImpact.conversations > 0
      ? Math.round(
          (botImpact.convertedConversations / botImpact.conversations) * 100,
        )
      : 0;
  const subscription = await getSubscription(db, tenant.id);
  const currentPlan: Plan = (subscription?.plan as Plan) ?? "FREE";
  const softCapUsd = settings?.softCapUsd ? Number(settings.softCapUsd) : null;
  const budgetTier = resolveBudgetTier({ monthlySpendUsd: monthlySpend, softCapUsd });
  const budgetLabel =
    budgetTier === "normal"
      ? "ปกติ"
      : budgetTier === "downgraded"
        ? "ลดต้นทุน (เกินงบ)"
        : "หยุด L3 ชั่วคราว";

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>ภาพรวม</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        สรุปร้าน {tenant.name}
      </p>

      <div className="grid">
          <div className="card kpi">
            <div className="label">บทสนทนา</div>
            <div className="value">{overview.conversations.total}</div>
            <div className="sub">
              เปิด {overview.conversations.open} · ส่งต่อคน{" "}
              {overview.conversations.handoff}
            </div>
          </div>
          <div className="card kpi">
            <div className="label">ออเดอร์ที่จ่ายแล้ว</div>
            <div className="value">{overview.orders.paid}</div>
            <div className="sub">รอชำระ {overview.orders.pending}</div>
          </div>
          <div className="card kpi">
            <div className="label">ยอดขาย</div>
            <div className="value">{baht(overview.orders.revenue)}</div>
            <div className="sub">จากออเดอร์ที่จ่ายแล้ว</div>
          </div>
          <div className="card kpi">
            <div className="label">Leads</div>
            <div className="value">{overview.leads.total}</div>
          </div>
          <div className="card kpi">
            <div className="label">AI calls</div>
            <div className="value">{overview.ai.calls}</div>
            <div className="sub">
              L1 rule · L2 {overview.ai.byLevel[2] ?? 0} · L3{" "}
              {overview.ai.byLevel[3] ?? 0}
            </div>
          </div>
          <div className="card kpi">
            <div className="label">ต้นทุน AI</div>
            <div className="value">${overview.ai.costUsd.toFixed(4)}</div>
            <div className="sub">สะสมทั้งหมด</div>
          </div>
          <div className="card kpi">
            <div className="label">งบ AI เดือนนี้</div>
            <div className="value">${monthlySpend.toFixed(4)}</div>
            <div className="sub">
              {softCapUsd
                ? `งบ $${softCapUsd.toFixed(2)} · ${budgetLabel}`
                : "ไม่จำกัด"}
            </div>
          </div>
        </div>

        <h2>ผลของแชทบอท 🤖</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          ยอดที่ปิดการขายผ่านแชท (ออเดอร์ที่เกิดจากบทสนทนา) — บอทช่วยขายให้จริงเท่าไหร่
        </p>
        <div className="grid">
          <div className="card kpi">
            <div className="label">ยอดขายจากแชทบอท</div>
            <div className="value">{baht(botImpact.chatRevenue)}</div>
            <div className="sub">
              {botImpact.chatPaid} ออเดอร์ที่จ่ายแล้ว (จากทั้งหมด {botImpact.chatOrders} ที่มาจากแชท)
            </div>
          </div>
          <div className="card kpi">
            <div className="label">อัตราปิดการขายจากแชท</div>
            <div className="value">{chatConversion}%</div>
            <div className="sub">
              {botImpact.convertedConversations} จาก {botImpact.conversations} บทสนทนา กลายเป็นออเดอร์
            </div>
          </div>
          <div className="card kpi">
            <div className="label">ออเดอร์นอกเวลาทำการ ⏰</div>
            <div className="value">{baht(botImpact.afterHoursRevenue)}</div>
            <div className="sub">
              {botImpact.afterHoursPaid} ออเดอร์ที่บอทปิดให้ตอนร้านปิด (ก่อน 9 โมง / หลัง 6 โมงเย็น)
            </div>
          </div>
          <div className="card kpi">
            <div className="label">บอทดูแลเอง</div>
            <div className="value">
              {overview.conversations.total > 0
                ? Math.round(
                    ((overview.conversations.total -
                      overview.conversations.handoff) /
                      overview.conversations.total) *
                      100,
                  )
                : 0}
              %
            </div>
            <div className="sub">
              ไม่ต้องส่งต่อให้แอดมิน ({overview.conversations.handoff} รายส่งต่อคน)
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: "0.78rem", marginTop: 8 }}>
          * เป็นยอดที่ <strong>มาจากแชท</strong> โดยตรง ไม่ใช่การเทียบ &quot;ใช้บอท vs
          ไม่ใช้บอท&quot; (ต้องมีข้อมูลช่วงก่อนใช้บอทมาเทียบ) — และยังไม่รวม
          <strong>กำไร</strong> เพราะระบบยังไม่มีช่องต้นทุนสินค้า
        </p>

        <h2>แพ็กเกจ</h2>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            แพ็กเกจปัจจุบัน: <strong>{currentPlan}</strong>
            {currentPlan !== "FREE"
              ? ` · ${PLAN_PRICE_THB[currentPlan]} บาท/เดือน`
              : " (ทดลองใช้)"}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["STARTER", "PRO"] as Plan[]).map((p) => (
              <form key={p} action={changePlanAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="plan" value={p} />
                <button type="submit" disabled={currentPlan === p}>
                  {currentPlan === p ? `กำลังใช้ ${p}` : `เปลี่ยนเป็น ${p}`} (
                  {PLAN_PRICE_THB[p]}฿)
                </button>
              </form>
            ))}
          </div>
          <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 0 }}>
            * เดโม — ยังไม่ตัดเงินจริง (เชื่อม Omise/2C2P ภายหลัง)
          </p>
        </div>

      <h2>บทสนทนาล่าสุด</h2>
      {conversations.length === 0 ? (
        <p className="muted">ยังไม่มีบทสนทนา</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>ช่องทาง</th>
                <th>สถานะ</th>
                <th>ลูกค้าทักล่าสุด</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/dashboard/${slug}/inbox/${c.id}`}>
                      {c.customerName ?? "(ไม่ระบุชื่อ)"}
                    </Link>
                  </td>
                  <td>
                    <span
                      style={{
                        color: channelLabel(c.channelType).color,
                        fontWeight: 500,
                        fontSize: "0.85rem",
                      }}
                    >
                      {channelLabel(c.channelType).label}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${statusClass(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>{when(c.lastInboundAt)}</td>
                  <td>
                    {c.status === "HANDOFF" ? (
                      <form action={releaseConversationAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="conversationId" value={c.id} />
                        <input type="hidden" name="back" value="overview" />
                        <button type="submit" className="ghost sm">
                          ให้บอทตอบ
                        </button>
                      </form>
                    ) : (
                      <form action={takeOverConversationAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="conversationId" value={c.id} />
                        <input type="hidden" name="back" value="overview" />
                        <button type="submit" className="ghost sm">
                          รับเรื่องเอง
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>ออเดอร์ล่าสุด</h2>
      {orders.length === 0 ? (
        <p className="muted">ยังไม่มีออเดอร์</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>สถานะ</th>
                <th>ยอดรวม</th>
                <th>เมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.customerName ?? "-"}</td>
                  <td>
                    <span className={`badge ${statusClass(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td>{baht(Number(o.total))}</td>
                  <td>{when(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
