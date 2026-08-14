# AI Sales CRM — Facebook + LINE

AI Sales CRM ที่จำลูกค้าได้ ตอบข้อมูลร้านถูกต้อง ติดตาม Lead ช่วยปิดการขาย และวิเคราะห์ว่าทำไมลูกค้าซื้อ/ไม่ซื้อ —
SaaS multi-tenant สำหรับเจ้าของร้าน รองรับ **Facebook Messenger + LINE OA**

> โปรเจกต์แยกจาก `bazi-sft-dataset` โดยเจตนา (คนละธุรกิจ/ลูกค้า/blast radius — ดู [docs/01-summary.md](docs/01-summary.md))

## สถานะ

🟢 **Phase 1 + Phase 2 (ส่วนที่เป็นโค้ด) เสร็จแล้ว** — มี test 130+ ตัว (unit + integration จริงกับ Supabase/Gemini)
เหลือส่วนที่ต้องต่อบริการจริง/process ภายนอก (ดู [การ deploy](#deploy) และ [docs/06-deploy.md](docs/06-deploy.md))

## สถาปัตยกรรม

```
Facebook Messenger ─┐
                     ├─> Channel Adapter ─> shared pipeline ─> Message Router ─> reply
LINE OA ─────────────┘   (verify+identity)   (CRM sync)        L1→L2→L3→L4
                                                                  │
                    ┌──────────────┬───────────────┬─────────────┤
                    ↓              ↓               ↓             ↓
              Knowledge(RAG)   CRM/Lead      Sales Engine    Analytics
              pgvector 768   Objection/Score Order/Payment  ทุกตาราง tenant_id
```

**Message Router (คุมต้นทุน + กัน Gemini ล่ม):**
- **L1** rule — ราคา/สต็อกจาก DB สด (ไม่เรียก AI)
- **L2** RAG — ค้น pgvector ตอบ FAQ ร้าน (grounded, ไม่มั่ว)
- **L3** Gemini — reasoning + แนะนำ (guardrails: ห้ามอ้างสรรพคุณ/ห้ามเดาราคา/discount ≤ authority)
- **L4** handoff — refund/dispute หรือ ตอบไม่ได้ → ส่งคน + เก็บเข้า Knowledge Gap Inbox

## ฟีเจอร์หลัก

| กลุ่ม | ฟีเจอร์ |
|---|---|
| ช่องทาง | LINE (รับ/ตอบ/push), Facebook Messenger — ใช้ shared inbound pipeline |
| AI | Router 4 ระดับ, Gemini L3, RAG L2, banned-phrase filter, graceful soft-cap |
| Sales | Order (ราคาจาก DB), Payment (PAID เมื่อยืนยันเท่านั้น), Lead scoring, Objection engine, Cross-sell |
| Follow-up | 24h window gating (Meta), cron, LINE push |
| Compliance | DPA log, PDPA profiling opt-in ในแชท, token เข้ารหัส AES-256-GCM |
| SaaS | Subscription (FREE/STARTER/PRO), entitlement gating, Team/Roles |
| Ops | Dashboard (overview/inbox/cost/analytics/gaps/team), metering ทุก AI call |

## เริ่มใช้งาน (dev)

```bash
npm install
cp .env.example .env      # เติม DATABASE_URL, GEMINI_API_KEY, TOKEN_ENCRYPTION_KEY
npm run db:migrate        # สร้าง 32 ตาราง + pgvector + HNSW
npm run db:seed           # (ทางเลือก) demo tenant + สินค้า
npm run dev               # http://localhost:3000/dashboard
```

ตัวแปรที่จำเป็น (ดู `.env.example`): `DATABASE_URL` (Supabase transaction pooler :6543),
`GEMINI_API_KEY` (billing), `TOKEN_ENCRYPTION_KEY` (32-byte base64). รายละเอียด DB ใน [docs/05-db-setup.md](docs/05-db-setup.md)

## คำสั่ง

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm test           # vitest (integration ข้ามเองถ้าไม่มี DATABASE_URL)
npm run db:migrate # apply migrations
npm run db:seed    # seed demo (--reset เพื่อล้างก่อน)
```

## โครงสร้างโค้ด

```
src/
  app/                # Next.js App Router (dashboard + API webhooks)
    api/webhooks/     # line/[channelId], facebook/[channelId], payment
    api/cron/         # followups (Vercel Cron)
    dashboard/        # overview, inbox, settings, analytics, gaps, team, new
  db/
    tables/           # Drizzle schema (tenant_id ทุกตาราง ยกเว้น tenants)
    repositories/     # query layer บังคับ tenant scope
  features/
    line/ facebook/ messaging/   # channel adapters + shared pipeline
    router/ ai/                  # Message Router + Gemini/RAG
    sales/ billing/ followup/    # CRM, subscription, follow-up engine
    consent/ team/ knowledge/    # PDPA, roles, gap inbox
  lib/                # env, crypto
tests/                # 33 test files (unit + integration)
drizzle/              # generated SQL migrations
```

## Deploy

Deploy บน **Vercel Pro** (cron ต้องถี่กว่าวันละครั้ง) — ขั้นตอนเต็มใน [docs/06-deploy.md](docs/06-deploy.md):
เชื่อม Supabase, ตั้ง env, สร้าง LINE OA / Facebook App จริง, เอา webhook URL จากหน้า Settings ไปวางในคอนโซลของแต่ละช่องทาง

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/01-summary.md](docs/01-summary.md) | ภาพรวม, จุดขาย, วิจัยตลาด |
| [docs/02-plan.md](docs/02-plan.md) | Roadmap + สถาปัตยกรรม |
| [docs/03-requirements.md](docs/03-requirements.md) | บริการ/บัญชีที่ต้องมี, งบ AI, ราคา |
| [docs/04-risks.md](docs/04-risks.md) | Risk register (จัดการในโค้ดแล้ว #1-#9) |
| [docs/05-db-setup.md](docs/05-db-setup.md) | ตั้งค่า Supabase |
| [docs/06-deploy.md](docs/06-deploy.md) | Deploy + เชื่อมช่องทางจริง |
