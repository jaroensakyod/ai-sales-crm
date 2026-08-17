/**
 * Drizzle schema barrel — multi-tenant AI Sales CRM.
 *
 * Table modules live in ./tables/*. Invariant: every table except `tenants`
 * carries `tenant_id` (via the tenantId() helper) and cascades on tenant delete.
 * Every query MUST filter by tenant_id (risk #8 — tenant isolation).
 *
 * See docs/02-plan.md and docs/03-requirements.md for the data model rationale.
 */

export * from "./tables/owner";
export * from "./tables/tenants";
export * from "./tables/channels";
export * from "./tables/customers";
export * from "./tables/sales";
export * from "./tables/commerce";
export * from "./tables/knowledge";
export * from "./tables/ops";
export * from "./tables/billing";
export * from "./tables/payment";
export * from "./tables/booking";
export * from "./tables/hotel";
export * from "./tables/course";
export * from "./tables/tags";
