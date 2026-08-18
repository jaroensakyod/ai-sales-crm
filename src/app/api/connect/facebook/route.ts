import crypto from "crypto";

import { getSession, isAuthEnabled } from "@/features/auth/session";
import {
  facebookConnectConfigured,
  facebookConnectUrl,
  signState,
} from "@/features/facebook/oauth";

// Start the self-service Facebook page-connect OAuth flow: redirect the merchant
// to Facebook's login/consent dialog. Facebook lets them pick which pages to
// grant; the callback then stores those pages + subscribes them to our webhook.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return new Response("missing slug", { status: 400 });

  if (!facebookConnectConfigured()) {
    return Response.redirect(
      `${url.origin}/dashboard/${slug}/settings?error=fb_notconfigured`,
      302,
    );
  }

  // Only the signed-in owner of this tenant may start a connect for it.
  if (isAuthEnabled()) {
    const session = await getSession();
    if (!session || session.tenantSlug !== slug) {
      return Response.redirect(`${url.origin}/dashboard/${slug}/login`, 302);
    }
  }

  const redirectUri = `${url.origin}/api/connect/facebook/callback`;
  const state = signState({ slug, nonce: crypto.randomBytes(8).toString("hex") });
  return Response.redirect(facebookConnectUrl(redirectUri, state), 302);
}
