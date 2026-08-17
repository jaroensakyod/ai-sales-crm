/**
 * One-off: reskin the demo-store tenant as "Your Life Code" (BaZi / ดวงจีน).
 * Replaces the product catalog with the 3 real products and sets the bot's
 * persona per the shop's reply-style guide. Safe to re-run (idempotent-ish:
 * wipes existing products first). Run:
 *   node --env-file=.env --import tsx scripts/reskin-demo.ts
 */
import { createDbClient, createDbSqlClient } from "@/db/client";
import { updateTenantAiSettings } from "@/db/repositories/ai";
import {
  createProduct,
  deleteProduct,
  listProducts,
} from "@/db/repositories/products";
import { getTenantBySlug } from "@/db/repositories/tenants";

const SLUG = "demo-store";

const PRODUCTS = [
  {
    name: "Your Life Code (Standard)",
    price: "1890",
    stock: null,
    description:
      "คู่มือดวงจีนเฉพาะบุคคล (ไฟล์ PDF) วิเคราะห์จากวันเวลาเกิดด้วยมือโดยซินแสเซียนปลาน้อย " +
      "ครอบคลุมการเงิน การงาน ความรัก คนรอบข้าง จังหวะชีวิต และสี/ทิศมงคล เปิดอ่านได้ทุกอุปกรณ์ " +
      "แถมคอร์ส BaZi Life Matrix ฟรี",
  },
  {
    name: "Your Life Code (Premium)",
    price: "2390",
    stock: null,
    description:
      "แพ็กเกจพรีเมียม: หนังสือปกแข็งพิมพ์สี + ไฟล์ PDF จัดส่งฟรี ใช้เวลาทำ 10-15 วัน " +
      "เนื้อหาเฉพาะบุคคลเหมือน Standard ทุกอย่าง แถมคอร์ส BaZi Life Matrix ฟรี",
  },
  {
    name: "BaZi Life Matrix Course",
    price: "499",
    stock: null,
    description:
      "คอร์สออนไลน์ในกลุ่ม Facebook ส่วนตัว 15 บทเรียน (ทฤษฎีห้าธาตุ ประเภทบุคลิก การงาน การเงิน ความสัมพันธ์) " +
      "เรียนได้ตลอดชีพ ไม่มีวันหมดอายุ — แถมฟรีเมื่อซื้อ Your Life Code",
  },
];

const PERSONA = [
  'ร้านนี้ขาย "Your Life Code" คู่มือดวงจีนเฉพาะบุคคล วิเคราะห์จากวันเดือนปีเกิดด้วยมือจริงโดยซินแสเซียนปลาน้อย (ไม่ได้ใช้ AI วิเคราะห์)',
  "ทักทายลูกค้าอย่างอบอุ่นว่า \"สวัสดีค่า\"",
  "จุดขายสำคัญ: เป็นการวิเคราะห์เฉพาะบุคคล ต้องใช้วันเวลาเกิด — ไม่เหมือนหนังสือดูดวงทั่วไปที่เขียนเหมารวม",
  "นำเสนอเป็นเครื่องมือ \"แนะแนวทางชีวิต\" ไม่ใช่การทำนายโชคชะตา และห้ามรับประกันผลลัพธ์ใด ๆ",
  "ทุกแพ็กเกจ Your Life Code แถมคอร์ส BaZi Life Matrix ฟรี",
  "Standard = ไฟล์ PDF เปิดได้ทุกอุปกรณ์ · Premium = หนังสือปกแข็งพิมพ์สี + PDF ส่งฟรี ใช้เวลาทำ 10-15 วัน",
  "ขั้นตอนสั่งซื้อ 2 ขั้น: (1) เลือกแพ็กเกจ + แจ้งวัน/เดือน/ปี และเวลาเกิด (2) โอนเงินแล้วแจ้งสลิป ทางร้านยืนยันและเริ่มวิเคราะห์ให้",
  "ถ้าลูกค้าขอเลขบัญชี/วิธีโอน ให้แจ้งข้อมูลการโอนได้เลย",
  "มีตัวอย่างเนื้อหาให้ดูก่อนตัดสินใจได้ (แจ้งลิงก์ตัวอย่างเมื่อลูกค้าสนใจ)",
].join("\n- ");

async function main() {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, SLUG);
  if (!tenant) throw new Error(`tenant '${SLUG}' not found`);
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  const existing = await listProducts(db, tenant.id);
  for (const p of existing) await deleteProduct(db, tenant.id, p.id);
  console.log(`removed ${existing.length} old products`);

  for (const p of PRODUCTS) {
    const row = await createProduct(db, tenant.id, p);
    console.log(`+ ${row.name} — ${row.price} THB`);
  }

  await updateTenantAiSettings(db, tenant.id, {
    systemPromptExtra: `- ${PERSONA}`,
    replyTone: "FRIENDLY",
    emojiLevel: "LITTLE",
  });
  console.log("updated AI persona (FRIENDLY tone, LITTLE emoji, shop guide)");

  await createDbSqlClient().end();
  console.log("done.");
}

main().catch((err) => {
  console.error("reskin failed:", err);
  process.exit(1);
});
