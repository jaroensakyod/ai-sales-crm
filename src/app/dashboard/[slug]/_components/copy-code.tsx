"use client";

import { useState } from "react";

/** A copyable value: shows it in a <code> box with a one-click copy button. */
export function CopyCode({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — user can still select the text manually
    }
  };
  return (
    <span
      style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
    >
      {label ? <span className="muted">{label}</span> : null}
      <code className="url" style={{ userSelect: "all" }}>
        {value}
      </code>
      <button type="button" className="ghost sm" onClick={copy}>
        {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
      </button>
    </span>
  );
}
