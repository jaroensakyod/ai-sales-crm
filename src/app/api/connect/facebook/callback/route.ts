import { createDbClient } from "@/db/client";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { connectFacebookChannel } from "@/features/onboarding/service";
import {
  exchangeCodeForUserToken,
  listUserPages,
  verifyState,
} from "@/features/facebook/oauth";

// OAuth callback: exchange the code, list the pages the merchant granted, then
// connect + subscribe each one. The merchant already chose which pages to allow
// in Facebook's own dialog, so we connect whatever comes back.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const state = stateRaw ? verifyState(stateRaw) : null;

  // No valid state → we can't trust which tenant this is for. Bounce home.
  if (!state?.slug) {
    return Response.redirect(`${origin}/`, 302);
  }
  const slug = state.slug;
  const settings = `${origin}/dashboard/${slug}/settings`;

  // The user cancelled the Facebook dialog.
  if (!code) return Response.redirect(`${settings}?error=fb_cancelled`, 302);

  const redirectUri = `${origin}/api/connect/facebook/callback`;
  const userToken = await exchangeCodeForUserToken(code, redirectUri);
  if (!userToken) return Response.redirect(`${settings}?error=fb_oauth`, 302);

  const pages = await listUserPages(userToken);
  if (pages.length === 0) {
    return Response.redirect(`${settings}?error=fb_nopages`, 302);
  }

  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) return Response.redirect(`${origin}/`, 302);

  let connected = 0;
  for (const page of pages) {
    try {
      await connectFacebookChannel(db, tenant.id, {
        displayName: page.name,
        pageId: page.id,
        accessToken: page.accessToken,
      });
      connected++;
    } catch {
      // Already connected, or over the plan's channel quota — skip.
    }
  }

  return Response.redirect(`${settings}?ok=fb_connected&n=${connected}`, 302);
}
