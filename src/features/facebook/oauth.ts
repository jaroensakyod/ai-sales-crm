import crypto from "crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

// Minimal permissions to receive/reply to Page messages. Connecting OTHER users'
// pages in production needs these at Advanced Access (Facebook App Review).
const SCOPES = "pages_show_list,pages_messaging,pages_manage_metadata";

/** Is the platform Facebook app configured for self-service connect? */
export function facebookConnectConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

/** HMAC-sign the OAuth `state` so the callback can trust the tenant slug it
 *  carries without a server-side session store (stateless CSRF protection). */
export function signState(payload: { slug: string; nonce: string }): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", process.env.META_APP_SECRET ?? "")
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): { slug: string; nonce: string } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", process.env.META_APP_SECRET ?? "")
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

/** The Facebook login dialog URL the merchant is redirected to. Facebook itself
 *  lets them choose which pages to grant, so we connect whatever they authorize. */
export function facebookConnectUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
  });
  // Facebook Login for Business apps carry the page permissions in a Configuration
  // (set FB_CONNECT_CONFIG_ID). Classic apps request them as a scope instead.
  const configId = process.env.FB_CONNECT_CONFIG_ID;
  if (configId) q.set("config_id", configId);
  else q.set("scope", SCOPES);
  return `https://www.facebook.com/v21.0/dialog/oauth?${q.toString()}`;
}

/** Exchange the OAuth code for a user access token. Returns null on failure. */
export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const q = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: redirectUri,
    code,
  });
  try {
    const res = await fetch(`${GRAPH}/oauth/access_token?${q.toString()}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

export type ConnectablePage = { id: string; name: string; accessToken: string };

/** List the pages the user granted, each with its own page access token. */
export async function listUserPages(userToken: string): Promise<ConnectablePage[]> {
  try {
    const res = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`,
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { id: string; name: string; access_token: string }[];
    };
    return (json.data ?? [])
      .filter((p) => p.id && p.access_token)
      .map((p) => ({ id: p.id, name: p.name ?? "FB Page", accessToken: p.access_token }));
  } catch {
    return [];
  }
}
