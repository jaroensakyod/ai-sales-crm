import Link from "next/link";

import { createStoreAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewStorePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <div className="topbar">
        <span className="brand">
          <Link href="/dashboard">AI Sales CRM</Link> / เปิดร้านใหม่
        </span>
      </div>
      <div className="container" style={{ maxWidth: 560 }}>
        <h1>เปิดร้านใหม่</h1>
        {error === "slug" ? (
          <p className="error">slug นี้มีอยู่แล้ว ลองใหม่</p>
        ) : null}
        {error === "missing" ? (
          <p className="error">กรอกชื่อร้านและยอมรับ DPA ก่อน</p>
        ) : null}

        <form action={createStoreAction} className="card">
          <label>
            ชื่อร้าน
            <input name="name" required placeholder="เช่น ร้านความงามมาลี" />
          </label>
          <label>
            slug (ลิงก์ร้าน, เว้นว่างให้สร้างจากชื่อ)
            <input name="slug" placeholder="malee-beauty" />
          </label>

          <fieldset style={{ border: "none", padding: 0, margin: "12px 0" }}>
            <legend className="muted">ประเภทธุรกิจ (เลือกได้หลายข้อ)</legend>
            <label className="inline">
              <input type="checkbox" name="businessTypes" value="CATALOG" /> ขายสินค้า
            </label>
            <label className="inline">
              <input type="checkbox" name="businessTypes" value="BOOKING" /> นัดหมาย/บริการ
            </label>
            <label className="inline">
              <input type="checkbox" name="businessTypes" value="COURSE" /> คอร์ส/สมาชิก
            </label>
          </fieldset>

          <label className="inline">
            <input type="checkbox" name="dpa" required /> ยอมรับข้อตกลงการประมวลผลข้อมูล
            (DPA) และนโยบายความเป็นส่วนตัว
          </label>

          <button type="submit" style={{ marginTop: 14 }}>
            สร้างร้าน
          </button>
        </form>
      </div>
    </>
  );
}
