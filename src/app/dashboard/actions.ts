"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import {
  createUser,
  getTenantBySlug,
  removeUser,
  updateUserRole,
} from "@/db/repositories/tenants";
import { ROLES, type Role } from "@/features/team/roles";
import { setPlan } from "@/db/repositories/subscriptions";
import { ingestKnowledge } from "@/features/ai/rag";
import { answerGap } from "@/features/knowledge/answer-gap";
import {
  connectFacebookChannel,
  connectLineChannel,
  createStore,
} from "@/features/onboarding/service";
import { hasGeminiApiKey } from "@/lib/env";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createStoreAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") || name));
  const businessTypes = formData.getAll("businessTypes").map(String) as (
    | "CATALOG"
    | "BOOKING"
    | "COURSE"
  )[];
  const dpa = formData.get("dpa") === "on";

  if (!name || !slug || !dpa) {
    redirect("/dashboard/new?error=missing");
  }

  const h = await headers();
  const db = createDbClient();
  let created = false;
  try {
    await createStore(db, {
      name,
      slug,
      businessTypes,
      ip: h.get("x-forwarded-for") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    });
    created = true;
  } catch {
    // Most likely a duplicate slug.
  }
  redirect(created ? `/dashboard/${slug}` : "/dashboard/new?error=slug");
}

export async function connectLineAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");

  let ok = false;
  try {
    await connectLineChannel(db, tenant.id, {
      displayName: String(formData.get("displayName") ?? "LINE OA"),
      basicId: String(formData.get("basicId") ?? "").trim(),
      channelSecret: String(formData.get("channelSecret") ?? "").trim(),
      accessToken: String(formData.get("accessToken") ?? "").trim(),
    });
    ok = true;
  } catch {
    // duplicate channel / bad input
  }
  redirect(`/dashboard/${slug}/settings?${ok ? "ok=line" : "error=line"}`);
}

export async function connectFacebookAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");

  let ok = false;
  try {
    await connectFacebookChannel(db, tenant.id, {
      displayName: String(formData.get("displayName") ?? "FB Page"),
      pageId: String(formData.get("pageId") ?? "").trim(),
      accessToken: String(formData.get("accessToken") ?? "").trim(),
    });
    ok = true;
  } catch {
    // duplicate channel / bad input
  }
  redirect(`/dashboard/${slug}/settings?${ok ? "ok=fb" : "error=fb"}`);
}

export async function addKnowledgeAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");

  if (!hasGeminiApiKey()) {
    redirect(`/dashboard/${slug}/settings?error=nokey`);
  }
  let ok = false;
  try {
    if (title && text) {
      await ingestKnowledge(db, tenant.id, { title, text });
      ok = true;
    }
  } catch {
    // embedding/ingest failed
  }
  redirect(`/dashboard/${slug}/settings?${ok ? "ok=knowledge" : "error=knowledge"}`);
}

export async function answerGapAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const gapId = String(formData.get("gapId") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");

  if (!hasGeminiApiKey()) {
    redirect(`/dashboard/${slug}/gaps?error=nokey`);
  }
  let ok = false;
  try {
    if (answer) ok = await answerGap(db, tenant.id, gapId, answer);
  } catch {
    // ingest failed
  }
  redirect(`/dashboard/${slug}/gaps?${ok ? "ok=1" : "error=1"}`);
}

export async function changePlanAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const plan = String(formData.get("plan") ?? "") as "FREE" | "STARTER" | "PRO";
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");
  if (["FREE", "STARTER", "PRO"].includes(plan)) {
    // NOTE: no real payment yet — Omise/2C2P wires in here later.
    await setPlan(db, tenant.id, plan);
  }
  redirect(`/dashboard/${slug}?plan=${plan}`);
}

export async function addUserAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "VIEWER") as Role;
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");
  if (email && ROLES.includes(role)) {
    await createUser(db, tenant.id, { email, name: name || undefined, role });
  }
  redirect(`/dashboard/${slug}/team`);
}

export async function changeRoleAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");
  if (ROLES.includes(role)) await updateUserRole(db, tenant.id, userId, role);
  redirect(`/dashboard/${slug}/team`);
}

export async function removeUserAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");
  await removeUser(db, tenant.id, userId);
  redirect(`/dashboard/${slug}/team`);
}
