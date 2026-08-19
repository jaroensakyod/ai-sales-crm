import { Fragment } from "react";
import Link from "next/link";

import { PricingPlans } from "./_components/pricing-plans";
import "./home.css";

export const metadata = {
  title: "AI Sales CRM — ผู้ช่วยขาย AI บน LINE & Facebook",
  description:
    "บอท AI ตอบแชท ปิดการขาย รับจองคิว/ห้อง/คอร์ส บน LINE และ Facebook — เริ่มต้น ฿290/เดือน",
};

const CHANNELS = [
  { name: "LINE", color: "#06c755", soon: false },
  { name: "Facebook", color: "#1877f2", soon: false },
  { name: "Instagram", color: "#e1306c", soon: false },
  { name: "WhatsApp", color: "#25d366", soon: true },
];

const BIZ = [
  { icon: "🛒", title: "ขายสินค้า", desc: "ตอบราคา/สต็อก ปิดการขาย แนะนำสินค้าคู่ รับสลิป" },
  { icon: "📅", title: "บริการ / นัดหมาย", desc: "รับจองคิวจากแชท เช็คเวลาว่าง กันจองชนกัน" },
  { icon: "🏨", title: "โรงแรม / ที่พัก", desc: "เช็คห้องว่างตามวันที่ จองห้อง คิดยอดต่อคืน" },
  { icon: "🎓", title: "คอร์ส / สมาชิก", desc: "รับสมัครเรียน จำกัดที่นั่ง บอกตารางเรียน" },
];

const FEATURES = [
  { icon: "💬", title: "AI ตอบเหมือนคน", desc: "จำบทสนทนา ตอบสั้นเป็นธรรมชาติ รับข้อความเสียง มีปุ่มกด และต่อแอดมินได้ทันที" },
  { icon: "🧾", title: "ปิดการขาย + ตรวจสลิป", desc: "สร้างออเดอร์ บอกวิธีโอน · อ่านยอดในสลิปอัตโนมัติเทียบกับออเดอร์ แล้วให้แอดมินกดยืนยัน" },
  { icon: "📆", title: "จอง/เช็คคิวอัตโนมัติ", desc: "รับจองคิว ห้อง คอร์ส จากแชท เช็คว่างจริง กันชนกันเอง" },
  { icon: "📣", title: "ยิงโปรฯ LINE", desc: "ส่งโปรฯ ถึงผู้ติดตามทั้งหมด แนบรูป ตั้งเวลาล่วงหน้าได้" },
  { icon: "🖼️", title: "ส่งรูปสินค้า", desc: "ลูกค้าขอดูรูป บอทส่งให้ทันที ทั้ง LINE และ Facebook" },
  { icon: "📊", title: "วิเคราะห์ + CRM", desc: "เห็นยอดขาย บทสนทนา และไปป์ไลน์ลูกค้าในที่เดียว" },
];

const STEPS = [
  { title: "เชื่อมช่องทาง", desc: "เชื่อม LINE OA / เพจ Facebook — มีคู่มือทีละขั้นในระบบ วางลิงก์เดียวจบ" },
  { title: "ใส่ข้อมูลร้าน", desc: "สินค้า/บริการ/ห้อง/คอร์ส + บัญชีรับเงิน — บอทดึงไปตอบลูกค้าให้เอง" },
  { title: "บอทขายให้ 24 ชม.", desc: "ลูกค้าทักมา บอทตอบ ปิดการขาย รับจอง — คุณแค่ยืนยันสลิป/ส่งของ" },
];

const REVIEWS = [
  { av: "ก", nm: "คุณกิ่ง", rl: "ร้านเครื่องสำอางออนไลน์", q: "ลูกค้าทักมาตอนดึกก็ตอบได้หมด ยอดขายกลางคืนเพิ่มขึ้นเยอะ ไม่ต้องนั่งเฝ้าแชทเองแล้ว" },
  { av: "น", nm: "คุณนัท", rl: "ร้านนวด & สปา", q: "ลูกค้าจองคิวนวดผ่านแชทเองได้เลย ระบบกันจองชนกันให้ด้วย ลดงานรับสายไปเยอะมาก" },
  { av: "พ", nm: "คุณพลอย", rl: "โรงแรมบูทีค", q: "เช็คห้องว่างแล้วจองได้ในแชทเลย แขกไม่ต้องรอเราตอบ ปิดการจองได้ไวขึ้นมาก" },
];

// Full feature-by-plan comparison (mirrors the real plan entitlements).
// Columns: Lite · Plus · Max · Enterprise.
const CMP_COLS = ["Lite", "Plus", "Max", "Enterprise"];
const CMP: { group: string; rows: { label: string; cells: (boolean | string)[] }[] }[] = [
  {
    group: "แชท & ช่องทาง",
    rows: [
      { label: "LINE + Facebook", cells: [true, true, true, true] },
      { label: "จำนวนช่องทาง", cells: ["2", "ไม่จำกัด", "ไม่จำกัด", "กำหนดเอง"] },
      { label: "ข้อความ AI ต่อเดือน", cells: ["2,000", "6,000", "15,000", "กำหนดเอง"] },
      { label: "AI ตอบเหมือนคน + จำบทสนทนา", cells: [true, true, true, true] },
      { label: "รับข้อความเสียง (ถอดเป็นข้อความ)", cells: [true, true, true, true] },
      { label: "ปุ่มกดในแชท (Quick reply)", cells: [true, true, true, true] },
      { label: "แอดมินเข้าคุยแทนบอทได้ (Live chat)", cells: [true, true, true, true] },
    ],
  },
  {
    group: "ขาย & ชำระเงิน",
    rows: [
      { label: "สร้างออเดอร์ + บอกวิธีโอน", cells: [true, true, true, true] },
      { label: "ตรวจสลิปอัตโนมัติ (OCR)", cells: [true, true, true, true] },
      { label: "ส่งรูปสินค้าในแชท", cells: [true, true, true, true] },
      { label: "เตือนตะกร้าค้าง + ขอรีวิวอัตโนมัติ", cells: [false, true, true, true] },
    ],
  },
  {
    group: "จอง & โมดูลธุรกิจ",
    rows: [
      { label: "จองคิว/นัดหมาย + เตือนก่อนนัด", cells: [true, true, true, true] },
      { label: "คอร์ส / สมาชิก", cells: [false, true, true, true] },
      { label: "ระบบโรงแรม / ห้องพัก", cells: [false, false, true, true] },
    ],
  },
  {
    group: "การตลาด & วิเคราะห์",
    rows: [
      { label: "ยิงโปรฯ LINE + ตั้งเวลา", cells: [false, true, true, true] },
      { label: "วิเคราะห์ลูกค้าเบื้องต้น", cells: [true, true, true, true] },
      { label: "วิเคราะห์เชิงลึก (ข้อโต้แย้ง + Lead score)", cells: [false, true, true, true] },
      { label: "CRM + Pipeline ลูกค้า", cells: [true, true, true, true] },
    ],
  },
  {
    group: "ขั้นสูง & องค์กร",
    rows: [
      { label: "เชื่อมต่อระบบภายใน (API / Webhook)", cells: [false, false, true, true] },
      { label: "ทีมดูแลเฉพาะ + ช่วยตั้งค่า", cells: [false, false, false, true] },
      { label: "ดูแลความปลอดภัย + SLA แบบกำหนดเอง", cells: [false, false, false, true] },
    ],
  },
];

const FOOT_COLS = [
  {
    title: "ฟีเจอร์",
    links: [
      { label: "AI ตอบแชท", href: "/#features" },
      { label: "ปิดการขาย + ตรวจสลิป", href: "/#features" },
      { label: "จอง/เช็คคิว", href: "/#features" },
      { label: "ยิงโปรฯ LINE", href: "/#features" },
      { label: "วิเคราะห์ + CRM", href: "/#features" },
    ],
  },
  {
    title: "ประเภทธุรกิจ",
    links: [
      { label: "ขายสินค้า", href: "/#biz" },
      { label: "บริการ / นัดหมาย", href: "/#biz" },
      { label: "โรงแรม / ที่พัก", href: "/#biz" },
      { label: "คอร์ส / สมาชิก", href: "/#biz" },
    ],
  },
  {
    title: "เริ่มใช้งาน",
    links: [
      { label: "ราคา", href: "/#pricing" },
      { label: "วิธีใช้งาน", href: "/#how" },
      { label: "คำถามที่พบบ่อย", href: "/#faq" },
      { label: "ทดลองฟรี 14 วัน", href: "/dashboard/new" },
      { label: "เข้าสู่ระบบ", href: "/login" },
    ],
  },
  {
    title: "กฎหมาย & ความเป็นส่วนตัว",
    links: [
      { label: "นโยบายความเป็นส่วนตัว", href: "/privacy" },
      { label: "ข้อกำหนดการใช้บริการ", href: "/terms" },
      { label: "ข้อตกลงประมวลผลข้อมูล (PDPA)", href: "/data-processing" },
    ],
  },
];

const FAQ = [
  { q: "ต้องเขียนโปรแกรมเป็นไหม", a: "ไม่ต้องเลยครับ — เชื่อมช่องทางด้วยการวางลิงก์ (มีคู่มือในระบบ) แล้วใส่ข้อมูลร้านผ่านหน้าเว็บ บอทก็เริ่มตอบให้ทันที" },
  { q: "บอทตอบเหมือนคนจริงแค่ไหน", a: "จำบทสนทนาก่อนหน้าได้ เลือกโทนการตอบได้ ตอบสั้นเป็นธรรมชาติ — ลูกค้าแทบแยกไม่ออกว่าเป็นบอท" },
  { q: "\"ข้อความ\" ในแพ็กเกจนับยังไง", a: "นับเฉพาะครั้งที่ AI ตอบ · คำถามราคา/สต็อกที่ตอบด้วยกฎไม่นับ — ใช้ได้จริงเยอะกว่าตัวเลข ถ้าเกินก็เติมได้ บอทไม่หยุดตอบ" },
  { q: "เก็บเงินลูกค้าได้เลยไหม", a: "บอทสร้างออเดอร์ + บอกวิธีโอน + รับสลิปได้ · การยืนยันเงินเข้าให้แอดมินกดยืนยัน (กันสลิปปลอม) ปลอดภัยกับร้าน" },
  { q: "ยกเลิกได้ไหม ผูกสัญญาหรือเปล่า", a: "ไม่ผูกสัญญา ยกเลิกได้ทุกเมื่อ · จ่ายรายเดือนหรือรายปี (ลด 20%) · ทดลองฟรี 14 วันก่อนได้" },
];

export default function Home() {
  return (
    <div className="home">
      <nav className="hnav">
        <div className="hnav-in">
          <div className="hbrand">🛍️ AI Sales CRM</div>
          <div className="hnav-links">
            <a href="#biz">ประเภทธุรกิจ</a>
            <a href="#features">ฟีเจอร์</a>
            <a href="#how">วิธีใช้</a>
            <a href="#pricing">ราคา</a>
          </div>
          <div className="hnav-cta">
            <Link href="/login" className="hbtn ghost">
              เข้าสู่ระบบ
            </Link>
            <Link href="/dashboard/new" className="hbtn primary">
              ทดลองฟรี
            </Link>
          </div>
        </div>
      </nav>

      <header className="hhero">
        <div className="hhero-grid">
          <div>
            <span className="heyebrow">🤖 ผู้ช่วยขาย AI · LINE &amp; Facebook</span>
            <h1>
              ให้ AI <span className="hl">ตอบแชท ปิดการขาย</span> แทนคุณ 24 ชั่วโมง
            </h1>
            <p className="hsub">
              บอทที่จำลูกค้าได้ ตอบเหมือนคนจริง แนะนำสินค้า รับจอง เก็บเงิน —
              ครบในตัวเดียว ไม่ต้องนั่งเฝ้าแชท
            </p>
            <div className="hhero-cta">
              <Link href="/dashboard/new" className="hbtn primary lg">
                เริ่มทดลองฟรี 14 วัน
              </Link>
              <a href="#how" className="hbtn ghost lg">
                ดูวิธีทำงาน
              </a>
            </div>
            <div className="hhero-note">
              เริ่มต้น <b>฿290/เดือน</b> · ไม่ต้องผูกบัตร
            </div>
          </div>

          <div className="hphone" aria-label="ตัวอย่างแชทที่บอทปิดการขาย">
            <div className="hphone-top">
              <div className="havatar">🛍️</div>
              <div>
                <div className="hwho">ร้านของคุณ</div>
                <div className="hst">● ตอบอัตโนมัติด้วย AI</div>
              </div>
            </div>
            <div className="hthread">
              <div className="hbub in">มีลิปสติกสีแดงไหมคะ ราคาเท่าไหร่</div>
              <div className="hbub out">
                ลิปสติกสีแดง Matte 390 บาทค่ะ ติดทนทั้งวัน
                <span className="hsmall">ลูกค้าส่วนใหญ่ซื้อบรัชออนคู่กันด้วยนะคะ 💄</span>
              </div>
              <div className="hbub in">เอา 1 แท่ง โอนยังไงคะ</div>
              <div className="hbub out">
                รับ 1 แท่ง รวม 390 บาทค่ะ
                <span className="hsmall">โอนมาที่ กสิกร 054-1-99123-9 แล้วส่งสลิปได้เลยค่ะ 🙏</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="hchannels">
        <div className="hchan-label">เชื่อมช่องทางแชทของร้านคุณ</div>
        <div className="hchan-row">
          {CHANNELS.map((c) => (
            <span key={c.name} className="hchan-badge">
              <span className="hcd" style={{ background: c.color }} />
              {c.name}
              {c.soon ? <span className="hsoon">เร็วๆ นี้</span> : null}
            </span>
          ))}
        </div>
      </section>

      <section id="biz" className="hsec">
        <div className="hsec-head">
          <div className="hsec-eye">รองรับทุกธุรกิจ</div>
          <h2>ร้านแบบไหนก็ใช้ได้ ระบบปรับตามธุรกิจคุณ</h2>
          <p>เลือกประเภทธุรกิจ แล้วบอทจะรู้ว่าต้องขายยังไง จองยังไง เก็บเงินยังไง</p>
        </div>
        <div className="hgrid-4">
          {BIZ.map((b) => (
            <div key={b.title} className="hbcard">
              <div className="hbic">{b.icon}</div>
              <h3>{b.title}</h3>
              <p>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="hsec tint">
        <div className="hsec-head">
          <div className="hsec-eye">ฟีเจอร์</div>
          <h2>ทุกอย่างที่ร้านต้องการ ในผู้ช่วยคนเดียว</h2>
          <p>ไม่ใช่แค่ตอบแชท — แต่ขายจริง ปิดจริง จัดการหลังบ้านให้ครบ</p>
        </div>
        <div className="hgrid-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="hfcard">
              <div className="hfic">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="hsec">
        <div className="hsec-head">
          <div className="hsec-eye">เริ่มใน 3 ขั้น</div>
          <h2>ตั้งค่าครั้งเดียว แล้วให้บอทขายให้</h2>
        </div>
        <div className="hgrid-3 hsteps">
          {STEPS.map((s, i) => (
            <div key={s.title} className="hstep">
              <div className="hstep-n">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hsec tint">
        <div className="hsec-head">
          <div className="hsec-eye">เสียงจากผู้ใช้</div>
          <h2>ร้านค้าใช้แล้วขายดีขึ้น</h2>
        </div>
        <div className="hgrid-3">
          {REVIEWS.map((r) => (
            <div key={r.nm} className="hreview">
              <div className="hstars">★★★★★</div>
              <p>&ldquo;{r.q}&rdquo;</p>
              <div className="hrwho">
                <span className="hav">{r.av}</span>
                <div>
                  <div className="hnm">{r.nm}</div>
                  <div className="hrl">{r.rl}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="hsec">
        <div className="hsec-head">
          <div className="hsec-eye">ราคา</div>
          <h2>เริ่มต้นถูก จ่ายเท่าที่ใช้ ยกเลิกได้ทุกเมื่อ</h2>
          <p>ทดลองฟรี 14 วัน ไม่ต้องผูกบัตร</p>
        </div>
        <PricingPlans />

        <div className="hcmp-wrap">
          <h3 className="hcmp-title">เปรียบเทียบแพ็กเกจแบบละเอียด</h3>
          <div className="hcmp-scroll">
            <table className="hcmp">
              <thead>
                <tr>
                  <th className="hcmp-feat">ฟีเจอร์</th>
                  {CMP_COLS.map((c, i) => (
                    <th key={c} className={i === 1 ? "hot" : ""}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CMP.map((g) => (
                  <Fragment key={g.group}>
                    <tr className="hcmp-group">
                      <td colSpan={CMP_COLS.length + 1}>{g.group}</td>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <td className="hcmp-feat">{r.label}</td>
                        {r.cells.map((cell, i) => (
                          <td key={i} className={i === 1 ? "hot" : ""}>
                            {typeof cell === "boolean" ? (
                              cell ? (
                                <span className="hcmp-yes">✓</span>
                              ) : (
                                <span className="hcmp-no">—</span>
                              )
                            ) : (
                              <span className="hcmp-val">{cell}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="faq" className="hsec tint">
        <div className="hsec-head">
          <div className="hsec-eye">คำถามที่พบบ่อย</div>
          <h2>สงสัยอะไร ถามได้เลย</h2>
        </div>
        <div className="hfaq">
          {FAQ.map((f, i) => (
            <details key={f.q} open={i === 0}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="contact" className="hsec">
        <div className="hcta">
          <h2>พร้อมให้ AI ขายให้คุณหรือยัง?</h2>
          <p>เริ่มทดลองฟรี 14 วันวันนี้ — ตั้งค่าไม่กี่นาที ไม่ต้องผูกบัตร</p>
          <Link href="/dashboard/new" className="hbtn white lg">
            เริ่มทดลองฟรี
          </Link>
        </div>
      </section>

      <footer className="hfoot">
        <div className="hfoot-top">
          <div className="hfoot-brand">
            <div className="hbrand">🛍️ AI Sales CRM</div>
            <p>ผู้ช่วยขาย AI สำหรับร้านค้าไทย บน LINE &amp; Facebook — ตอบแชท ปิดการขาย รับจอง เก็บเงิน ครบในตัวเดียว</p>
          </div>
          {FOOT_COLS.map((col) => (
            <div key={col.title} className="hfoot-col">
              <div className="hfoot-h">{col.title}</div>
              {col.links.map((l) => (
                <Link key={l.label} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="hfoot-bar">
          <span>© 2026 AI Sales CRM</span>
          <span className="hfoot-legal">
            <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
            <Link href="/terms">ข้อกำหนดการใช้บริการ</Link>
            <Link href="/data-processing">ข้อตกลงประมวลผลข้อมูล (PDPA)</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
