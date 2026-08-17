import Link from "next/link";
import type { ReactNode } from "react";

import "../home.css";
import "../legal.css";

/** Shared chrome for the public legal pages (privacy / terms / DPA). */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="home">
      <div className="legal">
        <div className="legal-nav">
          <Link href="/">🛍️ AI Sales CRM</Link>
          <Link href="/">← กลับหน้าแรก</Link>
        </div>
        <h1>{title}</h1>
        <p className="legal-meta">ปรับปรุงล่าสุด: {updated}</p>
        <p className="legal-note">
          เอกสารนี้เป็นแบบร่างมาตรฐานสำหรับผู้ให้บริการแพลตฟอร์ม
          ก่อนเผยแพร่ใช้งานจริงควรให้ที่ปรึกษากฎหมายตรวจทาน และเติมชื่อบริษัท
          เลขทะเบียนนิติบุคคล ที่อยู่ และช่องทางติดต่อของคุณในส่วนที่วงเล็บ [ ]
        </p>
        {children}
        <div className="legal-foot">
          © 2026 AI Sales CRM · หากมีข้อสงสัยเกี่ยวกับเอกสารนี้ ติดต่อ{" "}
          [อีเมลติดต่อ] · เอกสารที่เกี่ยวข้อง:{" "}
          <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link> ·{" "}
          <Link href="/terms">ข้อกำหนดการใช้บริการ</Link> ·{" "}
          <Link href="/data-processing">ข้อตกลงประมวลผลข้อมูล</Link>
        </div>
      </div>
    </div>
  );
}
