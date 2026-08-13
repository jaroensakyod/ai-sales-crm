# สรุปภาพรวมโปรเจกต์

## คืออะไร

**AI Sales CRM ที่จำลูกค้าได้ ตอบข้อมูลร้านถูกต้อง ติดตาม Lead ช่วยปิดการขาย และวิเคราะห์ว่าทำไมลูกค้าซื้อ/ไม่ซื้อ** — ไม่ใช่แค่ "แชทบอทตอบอัตโนมัติ"

รองรับ Facebook Messenger + LINE OA เป็น Phase แรก ออกแบบ Core ให้รองรับช่องทางอื่น (Instagram/TikTok/WhatsApp) และธุรกิจหลายประเภทได้ในอนาคตโดยไม่ต้องรื้อระบบ

## ทำไมต้องแยกโปรเจกต์จาก bazi-sft-dataset

- `bazi-sft-dataset` = แอปดวงสำหรับผู้ใช้ปลายทาง (B2C, auth ผ่าน LINE user)
- โปรเจกต์นี้ = SaaS ขายให้เจ้าของร้าน (B2B, auth แบบ dashboard login, multi-tenant)
- คนละ business, คนละ customer, คนละ blast radius — บั๊กฝั่งหนึ่งไม่ควรกระทบอีกฝั่ง
- Deploy แยก Vercel project ได้จาก repo/องค์กรเดียวกัน ไม่ต้องดูแลอะไรเพิ่ม จึงไม่มีเหตุผลด้าน ops ที่ต้องรวมโค้ด

**สิ่งที่ใช้ซ้ำได้จาก bazi-sft-dataset (pattern ไม่ใช่โค้ด):**
- Drizzle + Supabase transaction-pooler client setup (`src/db/client.ts`)
- LINE webhook signature validation + messaging client (`src/features/line-chat/`)
- Gemini usage-metering pattern (`*_usage` tables + `/stats` dashboard)
- Migration script convention (`apply-*-migration.ts` แทน `drizzle push` ตรงๆ)

## จุดขายหลัก (Differentiator)

จากการสำรวจตลาดไทย (ZWIZ.AI, Sellsuki, A2P Solution, Exito Group, iReadCustomer, Chinda, Omega Chatbot) พบว่า:

- ผู้เล่นส่วนใหญ่ยัง position เป็น **"ตอบแชทอัตโนมัติ 24 ชม."** เท่านั้น
- **ยังไม่มีใครทำ Objection Engine แยกประเภท + Lead Scoring/Pipeline เต็มรูปแบบ + Knowledge Gap Inbox + Follow-up ผูก Customer Memory แบบเซลมืออาชีพ** ครบวงจร
- **กลุ่มขายคอร์สออนไลน์แทบไม่มีผู้เล่นเฉพาะทางเลย** — ตลาดว่าง
- โมเดลราคาตลาดไทยส่วนใหญ่เป็น **"ขายโควตาข้อความ"** (ZWIZ เริ่ม 500 บาท/เดือน, bundle ปีละ 28,500-50,000 บาท) — เราได้เปรียบเพราะต้นทุน Gemini ต่อข้อความถูกมาก (ดู [03-requirements.md](03-requirements.md#งบประมาณ-ai-api)) จึงเสนอ **"ไม่จำกัดข้อความ"** เป็นจุดขายที่ตรงข้ามกับ pain point ตลาดได้

## กลุ่มธุรกิจที่รองรับ (Business Type Template)

แทนที่จะแยก template ตามชื่ออุตสาหกรรม (ร้านอาหาร/โรงแรม/ร้านค้า/คอร์ส) ใช้ **3 โครงสร้างข้อมูลหลัก** ผสมกันได้ ครอบคลุมธุรกิจได้กว้างกว่าด้วย effort น้อยกว่า:

| กลุ่ม | โครงสร้าง | ธุรกิจที่ใช้ได้ |
|---|---|---|
| **A. Catalog & Order** | product/price/stock/variant/shipping | ขายของออนไลน์, ความงาม, เสื้อผ้า, ไอที, ร้านยา |
| **B. Booking/Appointment** | resource + time_slot + duration + price | โรงแรม, คลินิก, สปา, ร้านทำผม/เล็บ, ทันตกรรม, ซ่อมรถ, ติวเตอร์ |
| **C. Course/Membership** | course/session + cohort schedule + recurring billing | คอร์สออนไลน์, ฟิตเนส/โยคะ, workshop |

**ร้านอาหาร = hybrid A+B** (เมนู/เดลิเวอรี่ใช้ A, จองโต๊ะใช้ B) — ไม่ต้องสร้าง template ที่ 4

ตอน onboarding ถามลูกค้า **"ธุรกิจคุณขายสินค้า / ให้บริการนัดหมาย / เปิดคอร์ส?"** (เลือกได้หลายข้อ) แทนถามชื่ออุตสาหกรรมตรงๆ

## Use case ตัวอย่างที่ระบบต้องทำได้

> ลูกค้า A ซื้อลิปสี → AI เสนอบรัชออนที่เข้ากัน (cross-sell จาก product-matching rule) → จบการขาย → Follow-up ถามความพึงพอใจ + เสนอสินค้าใหม่ตามพฤติกรรม เหมือนเซลมืออาชีพที่จำลูกค้าได้

ทำได้จริงและมีข้อมูลสนับสนุนว่าธุรกิจที่ทำ conversational upsell แบบนี้เพิ่ม AOV ได้ 15-25% — แต่ **ต้องออกแบบตาม Meta 24-hour messaging window + PDPA consent ให้ถูกต้องตั้งแต่สถาปัตยกรรม** (รายละเอียดใน [04-risks.md](04-risks.md))

## Deploy

Deploy บน Vercel ได้ทั้งหมด (webhook, DB ผ่าน Supabase, RAG ผ่าน pgvector) — ต้องใช้ **Vercel Pro** (ไม่ใช่ Hobby) เพราะ Follow-up Engine ต้องการ cron ถี่กว่าวันละครั้ง ตัวคอขวดจริงตอน scale คือ Supabase compute tier ไม่ใช่ Vercel
