// Sets the dashboard cookie when the shared password matches (see middleware.ts).
export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;
  const origin = new URL(req.url).origin;

  if (!expected || password !== expected) {
    return Response.redirect(`${origin}/dashboard/login?error=1`, 303);
  }

  const res = new Response(null, {
    status: 303,
    headers: { Location: `${origin}/dashboard` },
  });
  res.headers.append(
    "Set-Cookie",
    `dash=${encodeURIComponent(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
  );
  return res;
}
