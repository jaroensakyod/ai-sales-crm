"use client";

import Link from "next/link";
import { useState } from "react";

/** Yearly = 12 months less 20%. */
const YEARLY_DISCOUNT = 0.2;

type Plan = {
  name: string;
  monthly: number;
  q: string;
  tagline: string;
  hot: boolean;
  feats: string[];
};

const PLANS: Plan[] = [
  {
    name: "Lite",
    monthly: 290,
    q: "2,000 ข้อความ/เดือน",
    tagline: "ร้านเล็กเริ่มขายผ่านแชท",
    hot: false,
    feats: [
      "AI ตอบแชทปิดการขาย 24 ชม.",
      "2 ช่องทาง — LINE + Facebook",
      "ปิดการขาย + ตรวจสลิปอัตโนมัติ",
      "จองคิว/นัดหมาย + เตือนก่อนถึงนัด",
      "ส่งรูปสินค้าให้ลูกค้าในแชท",
      "วิเคราะห์เบื้องต้น — ยอดขาย/สินค้าขายดี",
    ],
  },
  {
    name: "Plus",
    monthly: 590,
    q: "6,000 ข้อความ/เดือน",
    tagline: "คุ้มสุด สำหรับร้านที่กำลังโต",
    hot: true,
    feats: [
      "ทุกอย่างในแผน Lite",
      "ช่องทางไม่จำกัด",
      "ยิงโปรฯ LINE — แนบรูป + ตั้งเวลา",
      "ติดตามอัตโนมัติ — เตือนตะกร้าค้าง + ขอรีวิว",
      "ระบบคอร์ส / สมาชิก",
      "วิเคราะห์เชิงลึก — ข้อโต้แย้ง + คะแนนลูกค้า",
    ],
  },
  {
    name: "Max",
    monthly: 990,
    q: "15,000 ข้อความ/เดือน",
    tagline: "ธุรกิจใหญ่ + โรงแรม/ที่พัก",
    hot: false,
    feats: [
      "ทุกอย่างในแผน Plus",
      "ระบบโรงแรม — เช็คห้องว่าง/จอง/คิดยอดต่อคืน",
      "ดูห้องว่างเรียลไทม์สำหรับเจ้าของ",
      "โควตาสูง 15,000 ข้อความ/เดือน",
      "เหมาะร้านใหญ่ / หลายสาขา",
    ],
  },
];

const ENTERPRISE = {
  name: "Enterprise",
  tagline: "องค์กร / เชนใหญ่ ที่ต้องการมากกว่านี้",
  feats: [
    "ทุกฟีเจอร์ในแผน Max",
    "โควตา & ช่องทางกำหนดเอง",
    "ทีมดูแลเฉพาะ + ช่วยตั้งค่าให้",
    "เชื่อมต่อระบบภายใน (API / Webhook)",
    "SLA + ความปลอดภัยระดับองค์กร",
  ],
};

const baht = (n: number) => n.toLocaleString("th-TH");

export function PricingPlans() {
  const [yearly, setYearly] = useState(false);

  return (
    <>
      <div className="hbill">
        <button
          type="button"
          className={!yearly ? "on" : ""}
          onClick={() => setYearly(false)}
        >
          รายเดือน
        </button>
        <button
          type="button"
          className={yearly ? "on" : ""}
          onClick={() => setYearly(true)}
        >
          รายปี <span className="hbill-save">ประหยัด 20%</span>
        </button>
      </div>

      <div className="hpgrid hpgrid-4">
        {PLANS.map((p) => {
          const yearPrice = Math.round((p.monthly * 12 * (1 - YEARLY_DISCOUNT)) / 10) * 10;
          const perMonth = Math.round(yearPrice / 12);
          return (
            <div key={p.name} className={`hpcard${p.hot ? " hot" : ""}`}>
              {p.hot ? <div className="hpbadge">คุ้มสุด</div> : null}
              <div className="hpn">{p.name}</div>
              <div className="hptag">{p.tagline}</div>
              {yearly ? (
                <>
                  <div className="hpp">
                    <small>฿</small>
                    {baht(perMonth)}
                    <small>/ด.</small>
                  </div>
                  <div className="hpq">
                    เก็บรายปี ฿{baht(yearPrice)} · ประหยัด{" "}
                    ฿{baht(p.monthly * 12 - yearPrice)}
                  </div>
                </>
              ) : (
                <>
                  <div className="hpp">
                    <small>฿</small>
                    {baht(p.monthly)}
                    <small>/ด.</small>
                  </div>
                  <div className="hpq">{p.q}</div>
                </>
              )}
              <Link
                href="/dashboard/new"
                className={`hbtn ${p.hot ? "primary" : "ghost"}`}
                style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
              >
                ทดลองใช้ฟรี
              </Link>
              <ul className="hpfeat">
                {p.feats.map((f) => (
                  <li key={f}>
                    <span className="hpck">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <div className="hpcard hpcard-ent">
          <div className="hpn">{ENTERPRISE.name}</div>
          <div className="hptag">{ENTERPRISE.tagline}</div>
          <div className="hpp-ent">ติดต่อเรา</div>
          <div className="hpq">ราคาตามการใช้งานจริง</div>
          <Link
            href="/#contact"
            className="hbtn ghost"
            style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
          >
            ติดต่อเจ้าหน้าที่
          </Link>
          <ul className="hpfeat">
            {ENTERPRISE.feats.map((f) => (
              <li key={f}>
                <span className="hpck">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
