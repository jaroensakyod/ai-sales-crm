"use server";

import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { setPlan } from "@/db/repositories/subscriptions";
import { isAdmin } from "@/features/admin/auth";

const PLANS = ["FREE", "STARTER", "PRO"] as const;

/** Change a store's plan (super-admin only). */
export async function adminSetPlanAction(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const tenantId = String(formData.get("tenantId") ?? "");
  const plan = String(formData.get("plan") ?? "") as (typeof PLANS)[number];
  if (tenantId && PLANS.includes(plan)) {
    await setPlan(createDbClient(), tenantId, plan);
  }
  redirect("/admin");
}
