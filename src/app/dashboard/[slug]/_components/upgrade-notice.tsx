import Link from "next/link";

/** Shown in place of a plan-gated module when the tenant's plan doesn't include
 *  it. Links to the plan section so they can upgrade. */
export function UpgradeNotice({
  slug,
  title,
  plan,
  desc,
}: {
  slug: string;
  title: string;
  plan: string;
  desc: string;
}) {
  return (
    <>
      <h1>{title}</h1>
      <div className="card" style={{ maxWidth: 560 }}>
        <p style={{ fontSize: "1.05rem", fontWeight: 600 }}>
          ฟีเจอร์นี้อยู่ในแผน {plan} ขึ้นไป
        </p>
        <p className="muted">{desc}</p>
        <Link href={`/dashboard/${slug}/settings`} className="btn-link">
          อัปเกรดแพ็กเกจ →
        </Link>
      </div>
    </>
  );
}
