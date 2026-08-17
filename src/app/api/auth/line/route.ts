import { redirect } from "next/navigation";

// LINE Login (social sign-in) start. Requires a LINE **Login** channel — separate
// from the Messaging API channel — and its credentials in env. Until configured,
// send the user back with a clear message instead of a broken redirect.
export function GET() {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const callback = process.env.LINE_LOGIN_CALLBACK_URL;
  if (!channelId || !callback) {
    redirect("/login?error=notconfigured");
  }
  // TODO: build the LINE Login authorize URL + state, then redirect there.
  //   https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=...
  redirect("/login?error=notconfigured");
}
