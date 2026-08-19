import type { SocialProfile } from "@/db/repositories/owners";

/** Config for each provider, or null when the platform hasn't set it up yet. */
export function lineLoginConfig() {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  const clientSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const redirectUri = process.env.LINE_LOGIN_CALLBACK_URL;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function facebookLoginConfig() {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.FB_LOGIN_CALLBACK_URL;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

// ---- authorize URLs ------------------------------------------------------

export function lineAuthUrl(state: string): string | null {
  const c = lineLoginConfig();
  if (!c) return null;
  const q = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    state,
    scope: "profile openid",
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${q}`;
}

export function facebookAuthUrl(state: string): string | null {
  const c = facebookLoginConfig();
  if (!c) return null;
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    state,
    // Only public_profile is default-available on a fresh app. `email` needs the
    // Email permission enabled/reviewed, and requesting it before that throws
    // "Invalid Scopes: email". Owners are keyed by FB user id, not email, so we
    // don't need it. Add "email" back once the permission is granted.
    scope: "public_profile",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
}

// ---- code -> profile -----------------------------------------------------

export async function exchangeLine(code: string): Promise<SocialProfile> {
  const c = lineLoginConfig();
  if (!c) throw new Error("LINE Login not configured");
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: c.redirectUri,
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  });
  if (!tokenRes.ok) throw new Error(`LINE token ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const profRes = await fetch("https://api.line.me/v2/profile", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!profRes.ok) throw new Error(`LINE profile ${profRes.status}`);
  const prof = (await profRes.json()) as {
    userId: string;
    displayName?: string;
    pictureUrl?: string;
  };
  return {
    provider: "LINE",
    providerId: prof.userId,
    displayName: prof.displayName,
    pictureUrl: prof.pictureUrl,
  };
}

export async function exchangeFacebook(code: string): Promise<SocialProfile> {
  const c = facebookLoginConfig();
  if (!c) throw new Error("Facebook Login not configured");
  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    client_secret: c.clientSecret,
    code,
  }).toString();
  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) throw new Error(`FB token ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const meUrl = new URL("https://graph.facebook.com/v21.0/me");
  meUrl.search = new URLSearchParams({
    fields: "id,name,email,picture",
    access_token,
  }).toString();
  const meRes = await fetch(meUrl);
  if (!meRes.ok) throw new Error(`FB profile ${meRes.status}`);
  const me = (await meRes.json()) as {
    id: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };
  return {
    provider: "FACEBOOK",
    providerId: me.id,
    displayName: me.name,
    email: me.email,
    pictureUrl: me.picture?.data?.url,
  };
}
