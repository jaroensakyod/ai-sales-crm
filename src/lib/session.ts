import { createHmac } from "node:crypto";

import { getSessionSecret } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

/**
 * Stateless signed session token: base64url(payload).base64url(hmac).
 * Self-contained so it can be verified without a DB round-trip.
 */
export type SessionPayload = {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  role: string;
  /** Expiry (epoch ms). */
  exp: number;
};

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(data: string): string {
  return b64url(createHmac("sha256", getSessionSecret()).update(data).digest());
}

export function signSession(
  payload: Omit<SessionPayload, "exp">,
  now = Date.now(),
): string {
  const full: SessionPayload = { ...payload, exp: now + TTL_MS };
  const body = b64url(JSON.stringify(full));
  return `${body}.${sign(body)}`;
}

export function verifySession(
  token: string | undefined | null,
  now = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  if (!safeEqual(sign(body), mac)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64").toString("utf8"),
    ) as SessionPayload;
    if (!payload.exp || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Owner (merchant) session — the person signed in via LINE/Facebook, who can
 *  own multiple stores. Signed the same way as the per-user session. */
export type OwnerSession = {
  ownerId: string;
  name: string;
  provider: string;
  exp: number;
};

export function signOwnerSession(
  payload: Omit<OwnerSession, "exp">,
  now = Date.now(),
): string {
  const full: OwnerSession = { ...payload, exp: now + TTL_MS };
  const body = b64url(JSON.stringify(full));
  return `${body}.${sign(body)}`;
}

export function verifyOwnerSession(
  token: string | undefined | null,
  now = Date.now(),
): OwnerSession | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  if (!safeEqual(sign(body), mac)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64").toString("utf8"),
    ) as OwnerSession;
    if (!payload.exp || payload.exp < now || !payload.ownerId) return null;
    return payload;
  } catch {
    return null;
  }
}
