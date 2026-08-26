import { createDbClient } from "@/db/client";
import {
  getKnowledgeContents,
  listKnowledgeDocuments,
} from "@/db/repositories/knowledge";
import { hasGeminiApiKey } from "@/lib/env";

import {
  addKnowledgeAction,
  deleteKnowledgeAction,
  editKnowledgeAction,
} from "../../actions";

/**
 * Per-feature knowledge base. Each feature page (products/booking/hotel/courses)
 * renders this with its own `category`, so the shop manages FAQ/policy per area.
 * The bot's RAG search still spans every category — this only splits the UI.
 */
export async function KnowledgeSection({
  slug,
  tenantId,
  category,
  back,
  label,
  ok,
  error,
}: {
  slug: string;
  tenantId: string;
  category: string;
  back: string;
  label: string;
  ok?: string;
  error?: string;
}) {
  const db = createDbClient();
  const docs = await listKnowledgeDocuments(db, tenantId, category);
  const contents = await getKnowledgeContents(
    db,
    tenantId,
    docs.map((d) => d.id),
  );

  return (
    <section style={{ marginTop: 28 }}>
      <h2>คลังความรู้ — {label}</h2>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        ข้อมูล/FAQ ของ{label} ที่ให้ AI ใช้ตอบลูกค้า (เช่น นโยบาย เงื่อนไข วิธีใช้)
      </p>
      {ok === "knowledge" ? <p className="ok">เพิ่มความรู้แล้ว</p> : null}
      {ok === "knowledge-edited" ? <p className="ok">แก้ไขความรู้แล้ว</p> : null}
      {ok === "knowledge-deleted" ? <p className="ok">ลบแล้ว</p> : null}
      {error === "knowledge" ? <p className="error">เพิ่มไม่สำเร็จ ลองใหม่</p> : null}
      {error === "nokey" ? (
        <p className="error">ต้องตั้งค่า GEMINI_API_KEY ก่อนจึงจะเพิ่มได้</p>
      ) : null}

      {docs.length === 0 ? (
        <p className="muted">ยังไม่มีคลังความรู้ของ{label} — เพิ่มด้านล่าง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>หัวข้อ</th>
                <th>สถานะ</th>
                <th>ชิ้นข้อมูล</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <details>
                      <summary style={{ cursor: "pointer" }}>
                        {d.title}
                        {!(d.sourceText ?? contents[d.id]) ? (
                          <span className="muted" style={{ fontSize: "0.78rem" }}>
                            {" "}(ไม่มีเนื้อหาเดิม — พิมพ์ใส่แล้วบันทึกได้)
                          </span>
                        ) : null}
                      </summary>
                      <form action={editKnowledgeAction} style={{ marginTop: 8 }}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="documentId" value={d.id} />
                        <input type="hidden" name="category" value={category} />
                        <input type="hidden" name="back" value={back} />
                        <label>
                          หัวข้อ
                          <input name="title" defaultValue={d.title} required />
                        </label>
                        <label>
                          เนื้อหา
                          <textarea
                            name="text"
                            rows={6}
                            required
                            defaultValue={d.sourceText ?? contents[d.id] ?? ""}
                          />
                        </label>
                        <button type="submit" className="sm" style={{ marginTop: 6 }}>
                          บันทึกการแก้ไข
                        </button>
                      </form>
                    </details>
                  </td>
                  <td>
                    <span className="badge open">{d.status}</span>
                  </td>
                  <td>{d.chunkCount}</td>
                  <td>
                    <form action={deleteKnowledgeAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="documentId" value={d.id} />
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className="danger sm">
                        ลบ
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!hasGeminiApiKey() ? (
        <p className="muted">ต้องตั้งค่า GEMINI_API_KEY ก่อนจึงจะเพิ่มได้</p>
      ) : null}
      <form action={addKnowledgeAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="back" value={back} />
        <label>
          หัวข้อ
          <input name="title" required placeholder={`เช่น นโยบาย${label}`} />
        </label>
        <label>
          เนื้อหา (วางข้อความ FAQ/รายละเอียด)
          <textarea name="text" rows={5} required />
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          เพิ่มความรู้
        </button>
      </form>
    </section>
  );
}
