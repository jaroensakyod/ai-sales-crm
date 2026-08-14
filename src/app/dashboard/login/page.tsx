export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="login-wrap">
      <h1>AI Sales CRM</h1>
      <p className="muted">เข้าสู่ระบบแดชบอร์ด</p>
      <form action="/api/dashboard/login" method="post">
        <input
          type="password"
          name="password"
          placeholder="รหัสผ่าน"
          autoFocus
        />
        {error ? <div className="error">รหัสผ่านไม่ถูกต้อง</div> : null}
        <button type="submit">เข้าสู่ระบบ</button>
      </form>
    </div>
  );
}
