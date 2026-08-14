import QRCode from "qrcode";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getOrderDetail } from "@/db/repositories/orders";
import { getPaymentSettings } from "@/db/repositories/payment-settings";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";
import { buildPaymentInstruction } from "@/features/payment/instruction";
import { buildPromptPayPayload } from "@/features/payment/promptpay";

import { updateOrderStatusAction } from "../../../actions";
import { Shell } from "../../_components/shell";

export const dynamic = "force-dynamic";

function baht(n: number) {
  return `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}
function statusClass(s: string) {
  if (s === "PAID" || s === "FULFILLED" || s === "CONFIRMED") return "paid";
  if (s === "PENDING_PAYMENT" || s === "PENDING") return "pending";
  if (s === "CANCELLED" || s === "REFUNDED" || s === "FAILED") return "handoff";
  return "open";
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const detail = await getOrderDetail(db, tenant.id, orderId);
  if (!detail) notFound();
  const { order, items, payments, customerName } = detail;
  const paySettings = await getPaymentSettings(db, tenant.id);
  const total = Number(order.total);
  const instruction = buildPaymentInstruction(paySettings, { total });
  const promptpayQr =
    paySettings?.promptpayId && total > 0
      ? await QRCode.toDataURL(
          buildPromptPayPayload(paySettings.promptpayId, total),
          { margin: 1, width: 220 },
        )
      : null;

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <p className="muted" style={{ marginBottom: 4 }}>
        <Link href={`/dashboard/${slug}/orders`}>← กลับรายการออเดอร์</Link>
      </p>
      <h1>
        ออเดอร์{" "}
        <span className={`badge ${statusClass(order.status)}`}>
          {order.status}
        </span>
      </h1>
      <p className="muted">ลูกค้า: {customerName ?? "-"}</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>จำนวน</th>
              <th>ราคา/ชิ้น</th>
              <th>รวม</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.nameSnapshot}</td>
                <td>{it.quantity}</td>
                <td>{baht(Number(it.unitPrice))}</td>
                <td>{baht(Number(it.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ textAlign: "right", marginTop: 10 }}>
        ยอดย่อย {baht(Number(order.subtotal))} · ส่วนลด{" "}
        {baht(Number(order.discount))} ·{" "}
        <strong>รวมสุทธิ {baht(Number(order.total))}</strong>
      </p>

      <h2>การชำระเงิน</h2>
      {payments.length === 0 ? (
        <p className="muted">ยังไม่มีรายการชำระ</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วิธี</th>
                <th>จำนวน</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.method}</td>
                  <td>{baht(Number(p.amount))}</td>
                  <td>
                    <span className={`badge ${statusClass(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {promptpayQr ? (
        <>
          <h2>PromptPay QR (สแกนจ่ายยอดนี้)</h2>
          <div className="card" style={{ display: "inline-block", textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promptpayQr} alt="PromptPay QR" width={220} height={220} />
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              ยอด {total.toLocaleString("th-TH")} บาท
            </div>
          </div>
        </>
      ) : null}

      <h2>ข้อความแจ้งโอนเงิน</h2>
      {!paySettings?.bankAccountNo && !paySettings?.promptpayId ? (
        <p className="muted">
          ยังไม่ได้ตั้งบัญชีรับเงิน — ไปที่ ตั้งค่า → บัญชีรับเงิน
        </p>
      ) : (
        <>
          <p className="muted">คัดลอกส่งลูกค้าได้เลย</p>
          <textarea
            readOnly
            rows={12}
            defaultValue={instruction}
            style={{ fontFamily: "inherit" }}
          />
        </>
      )}

      <h2>เปลี่ยนสถานะ</h2>
      <div className="row">
        {order.status === "PAID" ? (
          <form action={updateOrderStatusAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="status" value="FULFILLED" />
            <button type="submit">ทำเครื่องหมายจัดส่งแล้ว</button>
          </form>
        ) : null}
        {order.status !== "CANCELLED" && order.status !== "FULFILLED" ? (
          <form action={updateOrderStatusAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="status" value="CANCELLED" />
            <button type="submit" className="danger">
              ยกเลิกออเดอร์
            </button>
          </form>
        ) : null}
      </div>
    </Shell>
  );
}
