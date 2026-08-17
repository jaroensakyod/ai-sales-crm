import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listLeads, listSalesStages } from "@/db/repositories/leads";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import { moveLeadStageAction } from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

const UNASSIGNED = "__none__";

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const [stages, leads] = await Promise.all([
    listSalesStages(db, tenant.id),
    listLeads(db, tenant.id),
  ]);

  // Columns: unassigned first, then each stage in order.
  const columns = [
    { id: UNASSIGNED, name: "ยังไม่จัดกลุ่ม" },
    ...stages.map((s) => ({ id: s.id, name: s.name })),
  ];
  const byColumn = new Map(columns.map((c) => [c.id, [] as typeof leads]));
  for (const lead of leads) {
    const key = lead.stageId ?? UNASSIGNED;
    (byColumn.get(key) ?? byColumn.get(UNASSIGNED))!.push(lead);
  }

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>Pipeline การขาย</h1>
      <p className="muted">
        Lead จัดกลุ่มตามขั้นตอนการขาย เรียงตามคะแนน — เลื่อนขั้นได้จากการ์ด
      </p>

      {leads.length === 0 ? (
        <p className="muted">ยังไม่มี Lead — เกิดขึ้นอัตโนมัติเมื่อลูกค้าทักเข้ามา</p>
      ) : (
        <div className="board">
          {columns.map((col) => {
            const items = byColumn.get(col.id) ?? [];
            return (
              <div key={col.id} className="board-col">
                <h3>
                  <span>{col.name}</span>
                  <span>{items.length}</span>
                </h3>
                {items.map((lead) => (
                  <div key={lead.id} className="lead-card">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="name">
                        {lead.customerName ?? "(ไม่ระบุชื่อ)"}
                      </span>
                      <span className="score-pill">{lead.score}</span>
                    </div>
                    {stages.length > 0 ? (
                      <form action={moveLeadStageAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="leadId" value={lead.id} />
                        <select name="stageId" defaultValue={lead.stageId ?? ""}>
                          <option value="" disabled>
                            ย้ายไป…
                          </option>
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="sm ghost" style={{ marginTop: 6, width: "100%" }}>
                          ย้ายขั้น
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
