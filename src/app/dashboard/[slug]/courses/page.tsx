import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { courseSeatStatus, listEnrollments } from "@/db/repositories/course";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { getEntitlements } from "@/features/billing/entitlements";

import { createCourseAction, deleteCourseAction } from "../../actions";
import { KnowledgeSection } from "../_components/knowledge-section";
import { Shell } from "../_components/shell";
import { UpgradeNotice } from "../_components/upgrade-notice";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอยืนยัน",
  CONFIRMED: "ยืนยันแล้ว",
  CANCELLED: "ยกเลิก",
  COMPLETED: "จบแล้ว",
};

export default async function CoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "edit_sales");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  if (!(await getEntitlements(db, tenant.id)).courseModule) {
    return (
      <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
        <UpgradeNotice
          slug={slug}
          title="คอร์ส / สมาชิก"
          plan="Plus (฿590)"
          desc="รับสมัครเรียน จำกัดที่นั่ง และบอกตารางเรียนผ่านแชท อยู่ในแผนมาตรฐานขึ้นไป"
        />
      </Shell>
    );
  }

  const status = await courseSeatStatus(db, tenant.id);
  const enrollments = await listEnrollments(db, tenant.id);

  return (
    <Shell
      slug={slug}
      tenantName={tenant.name}
      role={session.role}
      businessTypes={tenant.businessTypes}
    >
      <h1>คอร์ส / สมาชิก</h1>
      <p className="muted">
        ตั้งคอร์ส + จำนวนที่นั่ง + ตารางเรียน — บอทจะบอกที่นั่งว่างและรับสมัครผ่านแชทให้
        (กันรับเกินจำนวน)
      </p>

      <h2>คอร์สที่เปิด</h2>
      {status.length === 0 ? (
        <p className="muted">ยังไม่มีคอร์ส — เพิ่มด้านล่าง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>คอร์ส</th>
                <th>ค่าเรียน</th>
                <th>ตารางเรียน</th>
                <th>ที่นั่ง</th>
                <th>ว่าง</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {status.map(({ course, enrolled, seatsLeft }) => (
                <tr key={course.id}>
                  <td>{course.name}</td>
                  <td>{Number(course.price).toLocaleString("th-TH")} บาท</td>
                  <td className="muted" style={{ fontSize: "0.82rem" }}>
                    {course.schedule ?? "—"}
                  </td>
                  <td>
                    {enrolled}/{course.capacity}
                  </td>
                  <td>
                    <span
                      className={`badge ${seatsLeft <= 0 ? "handoff" : seatsLeft <= course.capacity / 4 ? "open" : "paid"}`}
                    >
                      {seatsLeft <= 0 ? "เต็ม" : `ว่าง ${seatsLeft}`}
                    </span>
                  </td>
                  <td>
                    <form action={deleteCourseAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="courseId" value={course.id} />
                      <button type="submit" className="danger sm">
                        ลบ
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>เพิ่มคอร์ส</h2>
      <form action={createCourseAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <label>
          ชื่อคอร์ส
          <input name="name" required placeholder="เช่น คอร์สโยคะเบื้องต้น / ภาษาอังกฤษ A1" />
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <label style={{ flex: 1 }}>
            ค่าเรียน (บาท)
            <input name="price" type="number" step="0.01" required placeholder="2500" />
          </label>
          <label style={{ flex: 1 }}>
            จำนวนที่นั่ง
            <input name="capacity" type="number" min={1} defaultValue={20} />
          </label>
        </div>
        <label>
          ตารางเรียน (บอทบอกลูกค้า)
          <input name="schedule" placeholder="เช่น ทุกวันเสาร์ 10:00-12:00 เริ่ม 1 ก.ย." />
        </label>
        <label>
          รายละเอียดสั้น ๆ (แสดงบนการ์ด)
          <textarea name="description" rows={2} placeholder="เช่น สอนโดยครูมืออาชีพ รับผู้เริ่มต้น" />
        </label>
        <label>
          คลังความรู้คอร์ส (AI อ่านไว้ตอบเชิงลึก — ไม่ขึ้นบนการ์ด ใส่ยาวได้)
          <textarea
            name="aiKnowledge"
            rows={4}
            placeholder="ใส่ข้อมูลละเอียด: เนื้อหาที่สอน วิทยากร สิ่งที่ได้รับ เงื่อนไข คำถามที่ถามบ่อย ฯลฯ"
          />
        </label>
        <label>
          ลิงก์รูปคอร์ส (URL)
          <input name="imageUrl" type="url" placeholder="https://... (https + JPG/PNG)" />
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          เพิ่มคอร์ส
        </button>
      </form>

      <h2>ผู้สมัครล่าสุด</h2>
      {enrollments.length === 0 ? (
        <p className="muted">ยังไม่มีผู้สมัคร</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>คอร์ส</th>
                <th>ผู้สมัคร</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id}>
                  <td>{e.courseName ?? "—"}</td>
                  <td>{e.customerName ?? "—"}</td>
                  <td>
                    <span className={`badge ${e.status === "CONFIRMED" ? "paid" : "open"}`}>
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <KnowledgeSection slug={slug} tenantId={tenant.id} category="course" back="courses" label="คอร์ส" ok={ok} error={error} />
    </Shell>
  );
}
