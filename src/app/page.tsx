import Link from "next/link";

export const metadata = {
  title: "AI Sales CRM",
};

const ACTIONS = [
  {
    href: "/dashboard/demo-store",
    icon: "🏪",
    title: "ร้านตัวอย่าง (Demo)",
    desc: "เข้าดูแดชบอร์ดร้านตัวอย่างพร้อมข้อมูลจริง — ภาพรวม ยอดขาย บทสนทนา",
    go: "เปิดร้านเดโม →",
  },
  {
    href: "/dashboard",
    icon: "📋",
    title: "ร้านทั้งหมด",
    desc: "รายชื่อร้านค้าทั้งหมดในระบบ เลือกเข้าไปจัดการแต่ละร้าน",
    go: "ดูร้านทั้งหมด →",
  },
  {
    href: "/dashboard/new",
    icon: "✨",
    title: "เปิดร้านใหม่",
    desc: "สร้างร้านใหม่ ตั้งค่าประเภทธุรกิจ แล้วเชื่อม LINE / Facebook",
    go: "เริ่มเปิดร้าน →",
  },
];

const FEATURES = [
  "LINE + Facebook",
  "AI ตอบอัตโนมัติ (Gemini + RAG)",
  "ติดตาม Lead & ปิดการขาย",
  "Follow-up ตามกฎ Meta",
  "วิเคราะห์ Objection",
];

export default function Home() {
  return (
    <div className="landing">
      <div className="hero">
        <div className="logo">🛍️</div>
        <h1>AI Sales CRM</h1>
        <p>
          ผู้ช่วยขายอัจฉริยะสำหรับร้านค้า — จำลูกค้าได้ ตอบข้อมูลร้านถูกต้อง
          ติดตาม Lead และช่วยปิดการขาย บน Facebook Messenger + LINE
        </p>
      </div>

      <div className="action-grid">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="action-card">
            <div className="ac-icon">{a.icon}</div>
            <div className="ac-title">{a.title}</div>
            <div className="ac-desc">{a.desc}</div>
            <span className="ac-go">{a.go}</span>
          </Link>
        ))}
      </div>

      <div className="feature-list">
        {FEATURES.map((f) => (
          <span key={f}>✓ {f}</span>
        ))}
      </div>
    </div>
  );
}
