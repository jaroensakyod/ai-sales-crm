import { getSupabaseStorage } from "@/lib/env";

const BUCKET = "product-images";

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/** Allowed image types LINE/Facebook can render, and the size ceiling. */
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Upload a product image to Supabase Storage (public bucket) and return its
 * permanent public URL — the one the bot sends to customers. Creates the bucket
 * on first use. Uses the service-role key server-side. Returns a typed failure
 * instead of throwing so the dashboard can show a friendly message.
 */
export async function uploadProductImage(
  tenantId: string,
  productId: string,
  file: { bytes: ArrayBuffer; contentType: string },
): Promise<UploadResult> {
  const cfg = getSupabaseStorage();
  if (!cfg) return { ok: false, reason: "not_configured" };

  const type = file.contentType.toLowerCase();
  if (!ALLOWED.has(type)) return { ok: false, reason: "bad_type" };
  if (file.bytes.byteLength > MAX_BYTES) return { ok: false, reason: "too_big" };
  if (file.bytes.byteLength === 0) return { ok: false, reason: "empty" };

  await ensureBucket(cfg);

  // Stable-ish path per product; a timestamp busts CDN/LINE caching on replace.
  const path = `${tenantId}/${productId}-${Date.now()}.${EXT[type]}`;
  const res = await fetch(
    `${cfg.url}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.serviceKey}`,
        apikey: cfg.serviceKey,
        "content-type": type,
        "x-upsert": "true",
        "cache-control": "3600",
      },
      body: file.bytes,
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, reason: `upload_failed ${res.status}: ${body.slice(0, 200)}` };
  }

  return { ok: true, url: `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}` };
}

/** Create the public bucket if it doesn't exist (idempotent — ignores 409). */
async function ensureBucket(cfg: { url: string; serviceKey: string }) {
  await fetch(`${cfg.url}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.serviceKey}`,
      apikey: cfg.serviceKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: MAX_BYTES,
      allowed_mime_types: [...ALLOWED],
    }),
  }).catch(() => {
    // Already exists / transient — the upload call will surface a real error.
  });
}
