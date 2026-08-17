import Link from "next/link";

import "../home.css";
import "./login.css";

export const metadata = {
  title: "เข้าสู่ระบบ — AI Sales CRM",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const { error } = (await searchParams) ?? {};

  return (
    <div className="home login-page">
      <div className="login-card">
        <Link href="/" className="login-brand">
          🛍️ AI Sales CRM
        </Link>
        <h1>เข้าสู่ระบบ / สมัครใช้งาน</h1>
        <p className="login-sub">เข้าง่ายๆ ด้วยบัญชีที่คุณมีอยู่แล้ว</p>

        {error === "notconfigured" ? (
          <p className="login-err">
            ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วยช่องทางนี้ — ผู้ดูแลระบบต้องตั้งค่าก่อน
          </p>
        ) : null}

        <div className="login-btns">
          <a className="social-btn line" href="/api/auth/line">
            <span className="sb-ic">💬</span> เข้าสู่ระบบด้วย LINE
          </a>
          <a className="social-btn fb" href="/api/auth/facebook">
            <span className="sb-ic">f</span> เข้าสู่ระบบด้วย Facebook
          </a>
        </div>

        <div className="login-or"><span>หรือ</span></div>

        <Link href="/dashboard/new" className="hbtn ghost lg" style={{ width: "100%", justifyContent: "center" }}>
          เปิดร้านใหม่ (ทดลองฟรี)
        </Link>
        <Link href="/dashboard" className="login-alt">
          มีร้านอยู่แล้ว → เข้าหน้าจัดการร้าน
        </Link>

        <p className="login-fine">
          การเข้าใช้งานถือว่ายอมรับเงื่อนไขการใช้บริการและนโยบายความเป็นส่วนตัว
        </p>
      </div>
    </div>
  );
}
