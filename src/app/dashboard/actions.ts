"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { recordUsageEvent, updateTenantAiSettings } from "@/db/repositories/ai";
import {
  cancelScheduledBroadcast,
  createScheduledBroadcast,
} from "@/db/repositories/broadcasts";
import { getConnectedLineChannel } from "@/db/repositories/line";
import { createRoom, deleteRoom } from "@/db/repositories/hotel";
import { createCourse, deleteCourse } from "@/db/repositories/course";
import { getOwnerSession } from "@/features/auth/owner";
import { broadcastPromo, createLineClient } from "@/features/line/client";
import { decryptSecret } from "@/lib/crypto";
import { recordAudit } from "@/db/repositories/audit";
import {
  createRule,
  deleteRule,
  toggleRule,
} from "@/db/repositories/automation";
import {
  createTag,
  deleteTag,
  toggleTag,
} from "@/db/repositories/tags";
import { PRESET_TAGS } from "@/features/tags/presets";
import {
  createAppointment,
  createService,
  deleteService,
  getService,
  setAppointmentStatus,
} from "@/db/repositories/booking";
import { deleteKnowledgeDocument } from "@/db/repositories/knowledge";
import { moveLeadStage } from "@/db/repositories/leads";
import {
  applyDiscount,
  confirmPayment,
  updateOrderStatus,
} from "@/db/repositories/orders";
import { scheduleReviewRequest } from "@/features/reminders/order-events";
import { upsertPaymentSettings } from "@/db/repositories/payment-settings";
import {
  createPromotion,
  deletePromotion,
  togglePromotion,
} from "@/db/repositories/promotions";
import {
  addCrossSell,
  addVariant,
  createProduct,
  deleteProduct,
  deleteVariant,
  removeCrossSell,
  updateProduct,
} from "@/db/repositories/products";
import {
  createUser,
  getTenantBySlug,
  removeUser,
  setUserPassword,
  updateTenant,
  updateUserRole,
} from "@/db/repositories/tenants";
import { authenticate } from "@/features/auth/service";
import {
  clearSessionCookie,
  requirePermission,
  requireTenantAuth,
  setSessionCookie,
} from "@/features/auth/session";
import { ROLES, type Permission, type Role } from "@/features/team/roles";
import { hashPassword } from "@/lib/password";
import { toImageUrl, toMoney, toPlainText, toSlug, toStock } from "@/lib/validation";
import { setPlan } from "@/db/repositories/subscriptions";
import { ingestKnowledge } from "@/features/ai/rag";
import { answerGap } from "@/features/knowledge/answer-gap";
import {
  connectFacebookChannel,
  connectLineChannel,
  createStore,
} from "@/features/onboarding/service";
import { hasGeminiApiKey } from "@/lib/env";


export async function createStoreAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = toSlug(String(formData.get("slug") || name));
  const businessTypes = formData.getAll("businessTypes").map(String) as (
    | "CATALOG"
    | "BOOKING"
    | "COURSE"
    | "HOTEL"
  )[];
  const dpa = formData.get("dpa") === "on";

  if (!name || !slug || !dpa) {
    redirect("/dashboard/new?error=missing");
  }

  const h = await headers();
  const db = createDbClient();
  const owner = await getOwnerSession();
  let created = false;
  try {
    await createStore(db, {
      name,
      slug,
      businessTypes,
      ownerId: owner?.ownerId ?? null,
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
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");

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
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");

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
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");

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
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  await deleteKnowledgeDocument(db, tenant.id, documentId);
  redirect(`/dashboard/${slug}/settings?ok=knowledge-deleted`);
}

export async function answerGapAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const gapId = String(formData.get("gapId") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");

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
  const plan = String(formData.get("plan") ?? "") as
    | "FREE"
    | "STARTER"
    | "PRO"
    | "BUSINESS";
  const { db, tenant, session } = await tenantForSlug(slug, "manage_billing");
  if (["FREE", "STARTER", "PRO", "BUSINESS"].includes(plan)) {
    // NOTE: no real payment yet — Omise/2C2P wires in here later.
    await setPlan(db, tenant.id, plan);
    await recordAudit(db, tenant.id, {
      actorUserId: session.userId,
      action: "plan.change",
      data: { plan },
    });
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
  const { db, tenant, session } = await tenantForSlug(slug, "manage_team");
  if (password.length >= 6) {
    await setUserPassword(db, tenant.id, userId, hashPassword(password));
    await recordAudit(db, tenant.id, {
      actorUserId: session.userId,
      action: "user.password_set",
      entity: "user",
      entityId: userId,
    });
  }
  redirect(`/dashboard/${slug}/team?ok=pw`);
}

// ---- Products ------------------------------------------------------------

const parsePrice = (v: FormDataEntryValue | null) => toMoney(v);
const parseStock = (v: FormDataEntryValue | null) => toStock(v);

/**
 * Resolve the tenant for a mutating action AND enforce auth/permission at the
 * action layer (server actions are independently-invocable POST endpoints — the
 * page-level guard does not protect them). When AUTH_ENABLED is off this returns
 * an OWNER session (open); when on it requires a session whose tenant matches
 * the slug, plus the given permission.
 */
async function tenantForSlug(slug: string, permission?: Permission) {
  const session = await requireTenantAuth(slug);
  if (permission) await requirePermission(session, permission);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) redirect("/dashboard");
  return { db, tenant, session };
}

export async function createProductAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    await createProduct(db, tenant.id, {
      name,
      price: parsePrice(formData.get("price")),
      stock: parseStock(formData.get("stock")),
      sku: String(formData.get("sku") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      imageUrl: toImageUrl(formData.get("imageUrl")),
    });
  }
  redirect(`/dashboard/${slug}/products?ok=1`);
}

export async function updateProductAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("productId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
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
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await updateProduct(db, tenant.id, id, {
    name: String(formData.get("name") ?? "").trim(),
    price: parsePrice(formData.get("price")),
    stock: parseStock(formData.get("stock")),
    sku: String(formData.get("sku") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    imageUrl: toImageUrl(formData.get("imageUrl")),
    isActive: formData.get("isActive") === "on",
  });
  redirect(`/dashboard/${slug}/products?ok=1`);
}

export async function deleteProductAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("productId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deleteProduct(db, tenant.id, id);
  redirect(`/dashboard/${slug}/products?ok=1`);
}

export async function addVariantAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  if (name) {
    const priceRaw = String(formData.get("price") ?? "").trim();
    await addVariant(db, tenant.id, productId, {
      name,
      price: priceRaw ? parsePrice(formData.get("price")) : null,
      stock: parseStock(formData.get("stock")),
    });
  }
  redirect(`/dashboard/${slug}/products/${productId}`);
}

export async function deleteVariantAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("variantId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deleteVariant(db, tenant.id, id);
  redirect(`/dashboard/${slug}/products/${productId}`);
}

export async function addCrossSellAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const suggestedProductId = String(formData.get("suggestedProductId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  if (productId && suggestedProductId) {
    await addCrossSell(db, tenant.id, productId, suggestedProductId, reason);
  }
  redirect(`/dashboard/${slug}/products/${productId}`);
}

export async function removeCrossSellAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("crossSellId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await removeCrossSell(db, tenant.id, id);
  redirect(`/dashboard/${slug}/products/${productId}`);
}

export async function updatePaymentSettingsAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant, session } = await tenantForSlug(slug, "manage_settings");
  const str = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const hours = parseInt(String(formData.get("paymentWindowHours") ?? "12"), 10);
  await recordAudit(db, tenant.id, {
    actorUserId: session.userId,
    action: "payment.settings_change",
  });
  await upsertPaymentSettings(db, tenant.id, {
    shopName: str("shopName"),
    bankName: str("bankName"),
    bankAccountNo: str("bankAccountNo"),
    bankAccountName: str("bankAccountName"),
    promptpayId: str("promptpayId"),
    shippingNote: str("shippingNote"),
    paymentWindowHours: Number.isFinite(hours) ? hours : 12,
    instructionExtra: str("instructionExtra"),
  });
  redirect(`/dashboard/${slug}/settings?ok=payment`);
}

export async function updateStoreInfoAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  const name = String(formData.get("name") ?? "").trim();
  const businessTypes = formData.getAll("businessTypes").map(String) as (
    | "CATALOG"
    | "BOOKING"
    | "COURSE"
    | "HOTEL"
  )[];
  await updateTenant(db, tenant.id, {
    name: name || tenant.name,
    businessTypes,
  });
  redirect(`/dashboard/${slug}/settings?ok=store`);
}

export async function createPromotionAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const type = String(formData.get("type") ?? "PERCENT") as "PERCENT" | "FIXED";
  const value = parsePrice(formData.get("value"));
  if (Number(value) > 0) {
    await createPromotion(db, tenant.id, {
      code: String(formData.get("code") ?? "").trim().toUpperCase() || null,
      type,
      value,
    });
  }
  redirect(`/dashboard/${slug}/promotions`);
}

export async function togglePromotionAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("promotionId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await togglePromotion(db, tenant.id, id);
  redirect(`/dashboard/${slug}/promotions`);
}

export async function deletePromotionAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("promotionId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deletePromotion(db, tenant.id, id);
  redirect(`/dashboard/${slug}/promotions`);
}

export async function updateAiSettingsAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  const bannedPhrases = String(formData.get("bannedPhrases") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  await updateTenantAiSettings(db, tenant.id, {
    discountAuthority: parsePrice(formData.get("discountAuthority")),
    bannedPhrases,
    systemPromptExtra:
      String(formData.get("systemPromptExtra") ?? "").trim() || null,
    replyTone: String(formData.get("replyTone") ?? "").trim() || null,
    replyMode: String(formData.get("replyMode") ?? "").trim() || null,
    emojiLevel: String(formData.get("emojiLevel") ?? "").trim() || null,
  });
  redirect(`/dashboard/${slug}/settings?ok=ai`);
}

export async function updateOrderStatusAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as
    | "DRAFT"
    | "PENDING_PAYMENT"
    | "PAID"
    | "FULFILLED"
    | "CANCELLED"
    | "REFUNDED";
  const { db, tenant, session } = await tenantForSlug(slug, "edit_sales");
  const allowed = ["FULFILLED", "CANCELLED", "PAID", "PENDING_PAYMENT", "REFUNDED"];
  if (allowed.includes(status)) {
    await updateOrderStatus(db, tenant.id, orderId, status);
    await recordAudit(db, tenant.id, {
      actorUserId: session.userId,
      action: "order.status_change",
      entity: "order",
      entityId: orderId,
      data: { status },
    });
    // Order handed over → ask for a review a day later (best-effort; no-op if
    // the order has no reachable channel).
    if (status === "FULFILLED") {
      await scheduleReviewRequest(db, { tenantId: tenant.id, orderId });
    }
  }
  redirect(`/dashboard/${slug}/orders/${orderId}`);
}

/**
 * Merchant confirms a payment slip after reviewing it. This is the ONLY path
 * that flips an order to PAID (risk #9) — our slip OCR is advisory and never
 * confirms on its own. Confirming a PAID order also queues the review request.
 */
export async function confirmPaymentAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const { db, tenant, session } = await tenantForSlug(slug, "edit_sales");
  const { orderPaid } = await confirmPayment(db, tenant.id, paymentId);
  await recordAudit(db, tenant.id, {
    actorUserId: session.userId,
    action: "payment.confirm",
    entity: "payment",
    entityId: paymentId,
    data: { orderId, orderPaid },
  });
  redirect(`/dashboard/${slug}/orders/${orderId}`);
}

export async function applyDiscountAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const amount = Number(toMoney(formData.get("amount")));
  const { db, tenant, session } = await tenantForSlug(slug, "edit_sales");
  // Enforces the tenant's discount authority in code (risk #5).
  const result = await applyDiscount(db, tenant.id, orderId, amount);
  if (result.ok) {
    await recordAudit(db, tenant.id, {
      actorUserId: session.userId,
      action: "order.discount",
      entity: "order",
      entityId: orderId,
      data: { amount },
    });
  }
  redirect(
    `/dashboard/${slug}/orders/${orderId}?${result.ok ? "ok=discount" : "error=discount"}`,
  );
}

export async function createTagAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  const name = String(formData.get("name") ?? "").trim();
  const keywords = String(formData.get("keywords") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const guidance = String(formData.get("guidance") ?? "").trim();
  if (name && guidance && keywords.length > 0) {
    await createTag(db, tenant.id, { name, keywords, guidance });
  }
  redirect(`/dashboard/${slug}/tags`);
}

export async function addPresetTagAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const key = String(formData.get("presetKey") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  const preset = PRESET_TAGS.find((p) => p.key === key);
  if (preset) {
    await createTag(db, tenant.id, {
      name: preset.name,
      keywords: [...preset.keywords],
      guidance: preset.guidance,
    });
  }
  redirect(`/dashboard/${slug}/tags`);
}

export async function toggleTagAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("tagId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  await toggleTag(db, tenant.id, id);
  redirect(`/dashboard/${slug}/tags`);
}

export async function deleteTagAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("tagId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  await deleteTag(db, tenant.id, id);
  redirect(`/dashboard/${slug}/tags`);
}

export async function createAutomationAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  const triggerType = String(formData.get("trigger") ?? "") as
    | "ORDER_CREATED"
    | "ORDER_PAID";
  const delayHours = Math.max(
    0,
    parseInt(String(formData.get("delayHours") ?? "0"), 10) || 0,
  );
  const message = String(formData.get("message") ?? "").trim();
  const category = String(formData.get("category") ?? "PROMOTIONAL") as
    | "TRANSACTIONAL"
    | "PROMOTIONAL";
  if (
    ["ORDER_CREATED", "ORDER_PAID"].includes(triggerType) &&
    message
  ) {
    await createRule(db, tenant.id, {
      name: String(formData.get("name") ?? "").trim() || "กฎอัตโนมัติ",
      trigger: { type: triggerType },
      action: { type: "SCHEDULE_FOLLOWUP", delayHours, message, category },
    });
  }
  redirect(`/dashboard/${slug}/automation`);
}

export async function toggleAutomationAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("ruleId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  await toggleRule(db, tenant.id, id);
  redirect(`/dashboard/${slug}/automation`);
}

export async function deleteAutomationAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("ruleId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  await deleteRule(db, tenant.id, id);
  redirect(`/dashboard/${slug}/automation`);
}

// ---- Booking -------------------------------------------------------------

export async function createServiceAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const name = String(formData.get("name") ?? "").trim();
  const durationMin = Math.max(
    5,
    parseInt(String(formData.get("durationMin") ?? "60"), 10) || 60,
  );
  if (name) {
    await createService(db, tenant.id, {
      name,
      durationMin,
      price: toMoney(formData.get("price")),
      description: String(formData.get("description") ?? "").trim() || null,
    });
  }
  redirect(`/dashboard/${slug}/booking?ok=service`);
}

export async function deleteServiceAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("serviceId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deleteService(db, tenant.id, id);
  redirect(`/dashboard/${slug}/booking?ok=service`);
}

export async function createAppointmentAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const serviceId = String(formData.get("serviceId") ?? "") || null;
  const customerId = String(formData.get("customerId") ?? "");
  const startRaw = String(formData.get("startAt") ?? "");
  const startAt = startRaw ? new Date(startRaw) : null;
  if (!customerId || !startAt || Number.isNaN(startAt.getTime())) {
    redirect(`/dashboard/${slug}/booking?error=appointment`);
  }
  // Duration from the chosen service (default 60m).
  let durationMin = 60;
  if (serviceId) {
    const svc = await getService(db, tenant.id, serviceId);
    if (svc) durationMin = svc.durationMin;
  }
  const endAt = new Date(startAt.getTime() + durationMin * 60 * 1000);
  const result = await createAppointment(db, tenant.id, {
    serviceId,
    customerId,
    startAt,
    endAt,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  redirect(
    `/dashboard/${slug}/booking?${result.ok ? "ok=appointment" : "error=slot"}`,
  );
}

export async function setAppointmentStatusAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("appointmentId") ?? "");
  const status = String(formData.get("status") ?? "") as
    | "PENDING"
    | "CONFIRMED"
    | "CANCELLED"
    | "COMPLETED";
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  if (["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].includes(status)) {
    await setAppointmentStatus(db, tenant.id, id, status);
  }
  redirect(`/dashboard/${slug}/booking`);
}

export async function moveLeadStageAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  if (leadId && stageId) await moveLeadStage(db, tenant.id, leadId, stageId);
  redirect(`/dashboard/${slug}/leads`);
}

export async function addUserAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "VIEWER") as Role;
  const { db, tenant } = await tenantForSlug(slug, "manage_team");
  if (email && ROLES.includes(role)) {
    await createUser(db, tenant.id, { email, name: name || undefined, role });
  }
  redirect(`/dashboard/${slug}/team`);
}

export async function changeRoleAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const { db, tenant, session } = await tenantForSlug(slug, "manage_team");
  if (ROLES.includes(role)) {
    await updateUserRole(db, tenant.id, userId, role);
    await recordAudit(db, tenant.id, {
      actorUserId: session.userId,
      action: "user.role_change",
      entity: "user",
      entityId: userId,
      data: { role },
    });
  }
  redirect(`/dashboard/${slug}/team`);
}

export async function removeUserAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_team");
  await removeUser(db, tenant.id, userId);
  redirect(`/dashboard/${slug}/team`);
}

/**
 * Broadcast a promotion (optional banner image + text) to ALL of the OA's LINE
 * followers. Merchant-initiated and gated by a confirm checkbox (irreversible +
 * counts toward the monthly message quota per recipient).
 */
export async function broadcastLineAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  const raw = String(formData.get("message") ?? "").trim();
  const imageUrl = toImageUrl(formData.get("imageUrl"));
  const confirmed = formData.get("confirm") === "on";
  if (!raw && !imageUrl) redirect(`/dashboard/${slug}/broadcast?error=empty`);
  if (!confirmed) redirect(`/dashboard/${slug}/broadcast?error=confirm`);

  const line = await getConnectedLineChannel(db, tenant.id);
  if (!line) redirect(`/dashboard/${slug}/broadcast?error=nochannel`);

  const text = toPlainText(raw).slice(0, 4900); // LINE hard cap 5000 chars/text

  // Scheduled? The datetime-local input is naive local time — treat it as
  // Thailand time (+07:00) since shops are Thai, and store the real instant.
  const schedStr = String(formData.get("scheduledAt") ?? "").trim();
  if (schedStr) {
    const at = new Date(`${schedStr}:00+07:00`);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
      redirect(`/dashboard/${slug}/broadcast?error=badtime`);
    }
    await createScheduledBroadcast(db, tenant.id, {
      text: text || null,
      imageUrl,
      scheduledAt: at,
    });
    redirect(`/dashboard/${slug}/broadcast?ok=scheduled`);
  }
  try {
    const token = decryptSecret(line.connection.accessTokenEncrypted);
    await broadcastPromo(createLineClient(token), { text, imageUrl });
  } catch {
    redirect(`/dashboard/${slug}/broadcast?error=send`);
  }
  await recordUsageEvent(db, tenant.id, {
    type: "line_broadcast",
    meta: { chars: text.length, hasImage: Boolean(imageUrl) },
  });
  redirect(`/dashboard/${slug}/broadcast?ok=1`);
}

/** Cancel a still-pending scheduled broadcast. */
export async function cancelScheduledBroadcastAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("broadcastId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  await cancelScheduledBroadcast(db, tenant.id, id);
  redirect(`/dashboard/${slug}/broadcast?ok=cancelled`);
}

/** Add a hotel room type (name + nightly rate + how many rooms exist). */
export async function createRoomAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    await createRoom(db, tenant.id, {
      name,
      pricePerNight: parsePrice(formData.get("pricePerNight")),
      quantity: Math.max(1, parseInt(String(formData.get("quantity") ?? "1"), 10) || 1),
      capacity: Math.max(1, parseInt(String(formData.get("capacity") ?? "2"), 10) || 2),
      description: String(formData.get("description") ?? "").trim() || null,
      imageUrl: toImageUrl(formData.get("imageUrl")),
    });
  }
  redirect(`/dashboard/${slug}/hotel?ok=1`);
}

export async function deleteRoomAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("roomId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deleteRoom(db, tenant.id, id);
  redirect(`/dashboard/${slug}/hotel?ok=1`);
}

/** Add a course/cohort (name + price + seats + schedule). */
export async function createCourseAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    await createCourse(db, tenant.id, {
      name,
      price: parsePrice(formData.get("price")),
      capacity: Math.max(1, parseInt(String(formData.get("capacity") ?? "20"), 10) || 20),
      schedule: String(formData.get("schedule") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      imageUrl: toImageUrl(formData.get("imageUrl")),
    });
  }
  redirect(`/dashboard/${slug}/courses?ok=1`);
}

export async function deleteCourseAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("courseId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deleteCourse(db, tenant.id, id);
  redirect(`/dashboard/${slug}/courses?ok=1`);
}
