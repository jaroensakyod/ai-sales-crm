import "../../home.css";
import "../../login/login.css";

export const metadata = { title: "Admin — เข้าสู่ระบบผู้ดูแล" };

export default async function AdminLogin({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const { error } = (await searchParams) ?? {};
  return (
    <div className="home login-page">
      <form className="login-card" method="post" action="/api/admin/login">
        <div className="login-brand">🔐 Super Admin</div>
        <h1>เข้าสู่ระบบผู้ดูแล</h1>
        <p className="login-sub">ใส่รหัสผ่านผู้ดูแลระบบ (DASHBOARD_PASSWORD)</p>
        {error ? <p className="login-err">รหัสผ่านไม่ถูกต้อง</p> : null}
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="รหัสผ่าน"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text)",
            fontSize: 15,
          }}
        />
        <button
          type="submit"
          className="hbtn primary lg"
          style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
        >
          เข้าสู่ระบบ
        </button>
      </form>
    </div>
  );
}
