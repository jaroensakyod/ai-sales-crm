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
import { randomBytes } from "node:crypto";

import { setConversationHandling } from "@/db/repositories/conversations";
import { createReview, deleteReview } from "@/db/repositories/reviews";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  toggleWebhookEndpoint,
} from "@/db/repositories/webhooks";
import { getOwnerSession } from "@/features/auth/owner";
import { getEntitlements } from "@/features/billing/entitlements";
import { sendManualReply } from "@/features/messaging/manual-reply";
import {
  uploadImage,
  uploadProductImage,
  uploadReviewImage,
} from "@/features/storage/images";
import { enqueueWebhookEvent } from "@/features/webhooks/dispatch";
import {
  broadcastFlex,
  broadcastPromo,
  createLineClient,
} from "@/features/line/client";
import {
  createFlexCard,
  deleteFlexCard,
  flexCardToMessageCard,
  getFlexCard,
  updateFlexCardTrigger,
} from "@/db/repositories/flexCards";
import type { CarouselItem } from "@/db/tables/flexCards";
import {
  createQuickReply,
  deleteQuickReply,
} from "@/db/repositories/quickReplies";
import { suggestCaptions } from "@/features/ai/captions";
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

/** Upload an image file for a product to Supabase Storage and set it as the
 *  product's imageUrl (the picture the bot sends to customers). */
export async function uploadProductImageAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("productId") ?? "");
  const file = formData.get("image");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const base = `/dashboard/${slug}/products/${id}`;

  if (!(file instanceof File) || file.size === 0) {
    redirect(`${base}?error=nofile`);
  }
  const result = await uploadProductImage(tenant.id, id, {
    bytes: await (file as File).arrayBuffer(),
    contentType: (file as File).type,
  });
  if (!result.ok) {
    redirect(`${base}?error=${result.reason === "not_configured" ? "storage" : "upload"}`);
  }
  await updateProduct(db, tenant.id, id, { imageUrl: result.url });
  redirect(`${base}?ok=image`);
}

// ---- Reviews (social proof, capped per shop) -----------------------------

export async function addReviewAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const caption = String(formData.get("caption") ?? "");
  const authorName = String(formData.get("authorName") ?? "");
  const file = formData.get("image");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const base = `/dashboard/${slug}/reviews`;

  let imageUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    const up = await uploadReviewImage(tenant.id, {
      bytes: await file.arrayBuffer(),
      contentType: file.type,
    });
    if (!up.ok) {
      redirect(`${base}?error=${up.reason === "not_configured" ? "storage" : "upload"}`);
    }
    imageUrl = up.url;
  }

  const result = await createReview(db, tenant.id, { imageUrl, caption, authorName });
  if (!result.ok) redirect(`${base}?error=${result.reason}`);
  redirect(`${base}?ok=added`);
}

export async function deleteReviewAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("reviewId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deleteReview(db, tenant.id, id);
  redirect(`/dashboard/${slug}/reviews?ok=deleted`);
}

// ---- Welcome / promo banner ----------------------------------------------

/** Set the promo banner (image + message) the bot auto-sends on a first
 *  greeting / "what do you sell?". The image is optional here so the merchant
 *  can tweak just the message without re-uploading. */
export async function saveWelcomeBannerAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const file = formData.get("image");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const base = `/dashboard/${slug}/welcome`;

  const update: { welcomeMessage: string | null; welcomeImageUrl?: string } = {
    welcomeMessage: message || null,
  };
  if (file instanceof File && file.size > 0) {
    const up = await uploadImage(`${tenant.id}/welcome`, {
      bytes: await file.arrayBuffer(),
      contentType: file.type,
    });
    if (!up.ok) {
      redirect(`${base}?error=${up.reason === "not_configured" ? "storage" : "upload"}`);
    }
    update.welcomeImageUrl = up.url;
  }
  await updateTenantAiSettings(db, tenant.id, update);
  redirect(`${base}?ok=saved`);
}

export async function clearWelcomeBannerAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await updateTenantAiSettings(db, tenant.id, {
    welcomeImageUrl: null,
    welcomeMessage: null,
  });
  redirect(`/dashboard/${slug}/welcome?ok=cleared`);
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
    // Unchecked checkboxes submit nothing → false. A hidden "1" marker before each
    // checkbox lets us tell "form submitted with box off" from "field not on form".
    followupCartRecovery: formData.get("followupCartRecovery") === "on",
    followupReviewRequest: formData.get("followupReviewRequest") === "on",
    followupReminder: formData.get("followupReminder") === "on",
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
  if (orderPaid) {
    await enqueueWebhookEvent(db, tenant.id, "payment.confirmed", {
      orderId,
      paymentId,
    });
  }
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
  if (!(await getEntitlements(db, tenant.id)).promoBroadcast) {
    redirect(`/dashboard/${slug}/broadcast?error=plan`);
  }
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

// ── Flex cards (merchant-designed rich cards) ────────────────────────────────

export async function saveFlexCardAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const name = String(formData.get("name") ?? "").trim();
  const headline = String(formData.get("headline") ?? "").trim();
  if (!name || !headline) {
    redirect(`/dashboard/${slug}/flex-cards?error=empty`);
  }
  const buttonKind = formData.get("buttonKind") === "url" ? "url" : "message";
  const styleRaw = String(formData.get("style") ?? "plain");
  const style = ["plain", "promo", "minimal"].includes(styleRaw) ? styleRaw : "plain";
  await createFlexCard(db, tenant.id, {
    name,
    kind: "single",
    style,
    headline,
    body: String(formData.get("body") ?? "").trim() || null,
    priceLabel: String(formData.get("priceLabel") ?? "").trim() || null,
    imageUrl: toImageUrl(formData.get("imageUrl")),
    buttonLabel: String(formData.get("buttonLabel") ?? "").trim() || null,
    buttonKind,
    buttonValue: String(formData.get("buttonValue") ?? "").trim() || null,
    triggerKeyword: String(formData.get("triggerKeyword") ?? "").trim() || null,
  });
  redirect(`/dashboard/${slug}/flex-cards?ok=saved`);
}

/** AI-suggested sales captions for the composer's "เสนอแคปชั่น (AI)" button.
 *  Called directly from the client component (not a form submit). */
export async function suggestCaptionsAction(
  slug: string,
  input: { headline: string; description?: string },
): Promise<string[]> {
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  return suggestCaptions(db, tenant.id, {
    headline: String(input.headline ?? "").slice(0, 200),
    description: input.description ? String(input.description).slice(0, 500) : undefined,
  });
}

/** Save a carousel card built from several products. `items` arrives as a JSON
 *  string of CarouselItem[] from the composer's hidden field. */
export async function saveCarouselCardAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const name = String(formData.get("name") ?? "").trim();
  const styleRaw = String(formData.get("style") ?? "plain");
  const style = ["plain", "promo", "minimal"].includes(styleRaw) ? styleRaw : "plain";
  let items: CarouselItem[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("items") ?? "[]"));
    if (Array.isArray(parsed)) {
      items = parsed
        .filter((it) => it && typeof it.headline === "string")
        .slice(0, 10);
    }
  } catch {
    items = [];
  }
  if (!name || items.length === 0) {
    redirect(`/dashboard/${slug}/flex-cards?error=carousel`);
  }
  await createFlexCard(db, tenant.id, {
    name,
    kind: "carousel",
    style,
    items,
    triggerKeyword: String(formData.get("triggerKeyword") ?? "").trim() || null,
  });
  redirect(`/dashboard/${slug}/flex-cards?ok=saved`);
}

export async function deleteFlexCardAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("cardId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deleteFlexCard(db, tenant.id, id);
  redirect(`/dashboard/${slug}/flex-cards?ok=deleted`);
}

/** Set/clear the chat trigger keyword on an existing card. */
export async function updateFlexCardTriggerAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("cardId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const kw = String(formData.get("triggerKeyword") ?? "").trim() || null;
  await updateFlexCardTrigger(db, tenant.id, id, kw);
  redirect(`/dashboard/${slug}/flex-cards?ok=trigger`);
}

/** Broadcast a saved Flex card to all LINE friends (same quota + confirm rules
 *  as the plain promo broadcast). */
export async function broadcastFlexCardAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("cardId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  if (!(await getEntitlements(db, tenant.id)).promoBroadcast) {
    redirect(`/dashboard/${slug}/flex-cards?error=plan`);
  }
  if (formData.get("confirm") !== "on") {
    redirect(`/dashboard/${slug}/flex-cards?error=confirm`);
  }
  const card = await getFlexCard(db, tenant.id, id);
  if (!card) redirect(`/dashboard/${slug}/flex-cards?error=notfound`);
  const line = await getConnectedLineChannel(db, tenant.id);
  if (!line) redirect(`/dashboard/${slug}/flex-cards?error=nochannel`);
  try {
    const token = decryptSecret(line.connection.accessTokenEncrypted);
    await broadcastFlex(createLineClient(token), flexCardToMessageCard(card));
  } catch {
    redirect(`/dashboard/${slug}/flex-cards?error=send`);
  }
  await recordUsageEvent(db, tenant.id, {
    type: "line_broadcast",
    meta: { flexCardId: card.id },
  });
  redirect(`/dashboard/${slug}/flex-cards?ok=broadcast`);
}

// ── Quick-reply menu (merchant-defined tap buttons) ──────────────────────────

export async function createQuickReplyAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  const label = String(formData.get("label") ?? "").trim().slice(0, 20);
  const reply = String(formData.get("reply") ?? "").trim();
  if (!label || !reply) {
    redirect(`/dashboard/${slug}/quick-replies?error=empty`);
  }
  const sortOrder = Number(formData.get("sortOrder") ?? 0) || 0;
  await createQuickReply(db, tenant.id, { label, reply, sortOrder });
  redirect(`/dashboard/${slug}/quick-replies?ok=saved`);
}

export async function deleteQuickReplyAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await deleteQuickReply(db, tenant.id, id);
  redirect(`/dashboard/${slug}/quick-replies?ok=deleted`);
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
  if (!(await getEntitlements(db, tenant.id)).hotelModule) {
    redirect(`/dashboard/${slug}/hotel?error=plan`);
  }
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
  if (!(await getEntitlements(db, tenant.id)).courseModule) {
    redirect(`/dashboard/${slug}/courses?error=plan`);
  }
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

// ---- Inbox / live handoff ------------------------------------------------

/** Agent sends a reply to the customer. Sending implies taking over: the
 *  conversation moves to HANDOFF so the bot stays quiet until it's released. */
export async function replyInboxAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const message = String(formData.get("message") ?? "");
  const { db, tenant, session } = await tenantForSlug(slug, "edit_sales");
  const base = `/dashboard/${slug}/inbox/${conversationId}`;
  if (!message.trim()) redirect(`${base}?error=empty`);

  const result = await sendManualReply(db, tenant.id, conversationId, message);
  if (!result.ok) redirect(`${base}?error=send`);

  await setConversationHandling(db, tenant.id, conversationId, {
    status: "HANDOFF",
    assignedUserId: session.userId || null,
  });
  redirect(`${base}?ok=sent`);
}

/** Where to return after a status change: the thread, or the overview list
 *  (when the toggle was pressed from the overview). */
function inboxRedirect(slug: string, conversationId: string, back: string, ok: string) {
  return back === "overview"
    ? `/dashboard/${slug}?ok=${ok}`
    : `/dashboard/${slug}/inbox/${conversationId}?ok=${ok}`;
}

/** Take over without sending — pause the bot on this conversation. */
export async function takeOverConversationAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const back = String(formData.get("back") ?? "");
  const { db, tenant, session } = await tenantForSlug(slug, "edit_sales");
  await setConversationHandling(db, tenant.id, conversationId, {
    status: "HANDOFF",
    assignedUserId: session.userId || null,
  });
  redirect(inboxRedirect(slug, conversationId, back, "taken"));
}

/** Hand the conversation back to the bot. */
export async function releaseConversationAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const back = String(formData.get("back") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "edit_sales");
  await setConversationHandling(db, tenant.id, conversationId, {
    status: "OPEN",
    assignedUserId: null,
  });
  redirect(inboxRedirect(slug, conversationId, back, "released"));
}

// ---- Outbound webhooks (API integration) ---------------------------------

export async function createWebhookEndpointAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  if (!(await getEntitlements(db, tenant.id)).apiWebhooks) {
    redirect(`/dashboard/${slug}/webhooks?error=plan`);
  }
  // Require HTTPS — we sign the body, but the transport must be encrypted too.
  if (!/^https:\/\/.+/i.test(url)) {
    redirect(`/dashboard/${slug}/webhooks?error=url`);
  }
  const secret = "whsec_" + randomBytes(24).toString("hex");
  await createWebhookEndpoint(db, tenant.id, { url, secret });
  redirect(`/dashboard/${slug}/webhooks?ok=created`);
}

export async function toggleWebhookEndpointAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("endpointId") ?? "");
  const active = formData.get("active") === "on";
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  await toggleWebhookEndpoint(db, tenant.id, id, active);
  redirect(`/dashboard/${slug}/webhooks?ok=updated`);
}

export async function deleteWebhookEndpointAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("endpointId") ?? "");
  const { db, tenant } = await tenantForSlug(slug, "manage_settings");
  await deleteWebhookEndpoint(db, tenant.id, id);
  redirect(`/dashboard/${slug}/webhooks?ok=deleted`);
}
