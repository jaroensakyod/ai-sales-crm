import Link from "next/link";

import "../home.css";
import "./login.css";
import { loginWithEmail, signupWithEmail } from "./actions";

const ERR: Record<string, string> = {
  notconfigured:
    "ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วยช่องทางนี้ — ผู้ดูแลระบบต้องตั้งค่าก่อน",
  email: "อีเมลไม่ถูกต้อง",
  weakpw: "รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร",
  emailtaken: "อีเมลนี้มีบัญชีอยู่แล้ว — ลองเข้าสู่ระบบแทน",
  badcreds: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  state: "เซสชันหมดอายุ ลองใหม่อีกครั้ง",
  oauth: "เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง",
};

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

        {error && ERR[error] ? <p className="login-err">{ERR[error]}</p> : null}

        <div className="login-btns">
          <a className="social-btn line" href="/api/auth/line">
            <span className="sb-ic">💬</span> เข้าสู่ระบบด้วย LINE
          </a>
          <a className="social-btn fb" href="/api/auth/facebook">
            <span className="sb-ic">f</span> เข้าสู่ระบบด้วย Facebook
          </a>
        </div>

        <div className="login-or"><span>หรือ ใช้อีเมล</span></div>

        <form className="login-email">
          <input name="email" type="email" placeholder="อีเมล" required autoComplete="email" />
          <input
            name="password"
            type="password"
            placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)"
            required
            minLength={6}
            autoComplete="current-password"
          />
          <button className="hbtn lg" formAction={loginWithEmail} style={{ width: "100%", justifyContent: "center" }}>
            เข้าสู่ระบบ
          </button>
          <button
            className="hbtn ghost"
            formAction={signupWithEmail}
            style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
          >
            สมัครสมาชิกใหม่ด้วยอีเมล
          </button>
        </form>

        <div className="login-or"><span>หรือ</span></div>

        <Link href="/dashboard/new" className="hbtn ghost lg" style={{ width: "100%", justifyContent: "center" }}>
          เปิดร้านใหม่ (ทดลองฟรี)
        </Link>
        <Link href="/dashboard" className="login-alt">
          มีร้านอยู่แล้ว → เข้าหน้าจัดการร้าน
        </Link>

        <p className="login-fine">
          การเข้าใช้งานถือว่ายอมรับ{" "}
          <Link href="/terms">ข้อกำหนดการใช้บริการ</Link> และ{" "}
          <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
        </p>
      </div>
    </div>
  );
}
