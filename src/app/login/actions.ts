"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { createEmailOwner, getEmailOwner } from "@/db/repositories/owners";
import { hashPassword, verifyPassword } from "@/lib/password";
import { signOwnerSession } from "@/lib/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function startSession(ownerId: string, name: string): Promise<void> {
  const token = signOwnerSession({ ownerId, name, provider: "EMAIL" });
  (await cookies()).set("owner_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
}

export async function signupWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!EMAIL_RE.test(email)) redirect("/login?error=email");
  if (password.length < 6) redirect("/login?error=weakpw");

  const db = createDbClient();
  const existing = await getEmailOwner(db, email);
  if (existing) redirect("/login?error=emailtaken");

  const owner = await createEmailOwner(db, {
    email,
    passwordHash: hashPassword(password),
  });
  await startSession(owner.id, owner.displayName ?? email);
  redirect("/dashboard");
}

export async function loginWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const db = createDbClient();
  const owner = await getEmailOwner(db, email);
  // Same generic error whether the email is unknown or the password is wrong,
  // so we don't leak which emails have accounts.
  if (!owner?.passwordHash || !verifyPassword(password, owner.passwordHash)) {
    redirect("/login?error=badcreds");
  }
  await startSession(owner.id, owner.displayName ?? email);
  redirect("/dashboard");
}
