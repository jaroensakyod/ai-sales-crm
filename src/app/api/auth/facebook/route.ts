import { redirect } from "next/navigation";

// Facebook Login (social sign-in) start. Requires a Facebook Login OAuth config
// (App ID + secret + redirect URI) in env. Until configured, send the user back
// with a clear message instead of a broken redirect.
export function GET() {
  const appId = process.env.META_APP_ID;
  const callback = process.env.FB_LOGIN_CALLBACK_URL;
  if (!appId || !callback) {
    redirect("/login?error=notconfigured");
  }
  // TODO: build the Facebook OAuth dialog URL + state, then redirect there.
  //   https://www.facebook.com/v21.0/dialog/oauth?client_id=...
  redirect("/login?error=notconfigured");
}
