# Database setup — new Supabase project (Phase 1)

โปรเจกต์นี้ใช้ **DB แยกจาก bazi** โดยเจตนา (blast radius — ดู [01-summary.md](01-summary.md)).
เลือกสร้าง **Supabase project ใหม่ในบัญชีเดิม** (free tier รองรับ 2 projects — bazi ใช้ไป 1)

## ขั้นตอน (ทำใน Dashboard — ต้อง login เอง)

1. เปิด https://supabase.com/dashboard → บัญชีเดิม (บัญชีเดียวกับ bazi)
2. **New project**
   - Name: `ai-sales-crm`
   - Database Password: ตั้งรหัสแข็งแรง **แล้วเก็บไว้** (จะอยู่ใน connection string)
   - Region: **Southeast Asia (Singapore) — ap-southeast-1** (ใกล้สุด, latency ต่ำ)
3. รอ provisioning ~2 นาที
4. เอา connection string (โหมด **Transaction**, port **6543**):
   - **Project Settings → Database → Connection string → URI → เลือก tab "Transaction"**
   - หน้าตา: `postgresql://postgres.<ref>:<PASSWORD>@aws-...pooler.supabase.com:6543/postgres`
   - ⚠️ ต้องเป็น **:6543 (Transaction pooler)** ไม่ใช่ :5432 (direct) — client เราตั้ง `prepare:false` ไว้สำหรับ pooler
5. วางลงไฟล์ `.env` ของโปรเจกต์นี้ (คัดจาก `.env.example`):
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-...pooler.supabase.com:6543/postgres
   ```
6. pgvector: **ไม่ต้องทำมือ** — migration `0000_init.sql` มี `CREATE EXTENSION IF NOT EXISTS vector;` อยู่แล้ว
   (ถ้าอยากเปิดล่วงหน้า: Dashboard → Database → Extensions → เปิด `vector`)

## จากนั้นผมรันให้

```bash
npm run db:migrate
```

จะสร้าง 30 ตาราง + enums + pgvector ให้ครบในครั้งเดียว

## ทางเลือก: ใช้ Neon แทน

ถ้าอยากใช้ Neon (DB หลักของ bazi ก็เป็น Neon): สร้าง **project ใหม่** ที่ https://console.neon.tech
→ เอา pooled connection string (`...-pooler...neon.tech`) มาใส่ `DATABASE_URL` แทน
client เดียวกันใช้ได้ (`prepare:false` รองรับทั้ง Supabase pooler และ Neon PgBouncer)
