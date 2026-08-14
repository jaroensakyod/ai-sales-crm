"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { updateTenantAiSettings } from "@/db/repositories/ai";
import { deleteKnowledgeDocument } from "@/db/repositories/knowledge";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/db/repositories/products";
import {
  createUser,
  getTenantBySlug,
  removeUser,
  setUserPassword,
  updateUserRole,
} from "@/db/repositories/tenants";
import { authenticate } from "@/features/auth/service";
import {
  clearSessionCookie,
  setSessionCookie,
} from "@/features/auth/session";
import { ROLES, type Role } from "@/features/team/roles";
import { hashPassword } from "@/lib/password";
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

export async function deleteKnowledgeAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const { db, tenant } = await tenantForSlug(slug);
  await deleteKnowledgeDocument(db, tenant.id, documentId);
  redirect(`/dashboard/${slug}/settings?ok=knowledge-deleted`);
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

export async function loginAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const db = createDbClient();
  const session = await authenticate(db, slug, email, password);
  if (!session) {
    redirect(`/dashboard/${slug}/login?error=1`);
  }
  await setSessionCookie(session);
  redirect(`/dashboard/${slug}`);
}

export async function logoutAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  await clearSessionCookie();
  redirect(`/dashboard/${slug}/login`);
}

export async function setUserPasswordAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");
  if (password.length >= 6) {
    await setUserPassword(db, tenant.id, userId, hashPassword(password));
  }
  redirect(`/dashboard/${slug}/team?ok=pw`);
}

// ---- Products ------------------------------------------------------------

function parsePrice(v: FormDataEntryValue | null): string {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}
function parseStock(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

async function tenantForSlug(slug: string) {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");
  return { db, tenant };
}

export async function createProductAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug);
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    await createProduct(db, tenant.id, {
      name,
      price: parsePrice(formData.get("price")),
      stock: parseStock(formData.get("stock")),
      sku: String(formData.get("sku") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
    });
  }
  redirect(`/dashboard/${slug}/products?ok=1`);
}

export async function updateProductAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("productId") ?? "");
  const { db, tenant } = await tenantForSlug(slug);
  await updateProduct(db, tenant.id, id, {
    name: String(formData.get("name") ?? "").trim(),
    price: parsePrice(formData.get("price")),
    stock: parseStock(formData.get("stock")),
    isActive: formData.get("isActive") === "on",
  });
  redirect(`/dashboard/${slug}/products?ok=1`);
}

/** Full edit (incl. description + SKU) from the per-product page. */
export async function editProductAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("productId") ?? "");
  const { db, tenant } = await tenantForSlug(slug);
  await updateProduct(db, tenant.id, id, {
    name: String(formData.get("name") ?? "").trim(),
    price: parsePrice(formData.get("price")),
    stock: parseStock(formData.get("stock")),
    sku: String(formData.get("sku") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    isActive: formData.get("isActive") === "on",
  });
  redirect(`/dashboard/${slug}/products?ok=1`);
}

export async function deleteProductAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("productId") ?? "");
  const { db, tenant } = await tenantForSlug(slug);
  await deleteProduct(db, tenant.id, id);
  redirect(`/dashboard/${slug}/products?ok=1`);
}

export async function updateAiSettingsAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug);
  const bannedPhrases = String(formData.get("bannedPhrases") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  await updateTenantAiSettings(db, tenant.id, {
    discountAuthority: parsePrice(formData.get("discountAuthority")),
    bannedPhrases,
    systemPromptExtra:
      String(formData.get("systemPromptExtra") ?? "").trim() || null,
  });
  redirect(`/dashboard/${slug}/settings?ok=ai`);
}

export async function addUserAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
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
