import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { tenantId } from "./tenants";

/** Channel is an adapter, not the core (docs/02-plan.md). Extensible list. */
export const channelTypeEnum = pgEnum("channel_type", [
  "MESSENGER",
  "LINE",
  "INSTAGRAM",
  "TIKTOK",
  "WHATSAPP",
]);

/** Per-page/OA connection health, surfaced to the merchant for self-reconnect (risk #7). */
export const connectionStatusEnum = pgEnum("connection_status", [
  "CONNECTED",
  "TOKEN_ERROR",
  "PERMISSION_REVOKED",
  "DISCONNECTED",
  "RECONNECT_REQUIRED",
]);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    type: channelTypeEnum("type").notNull(),
    displayName: text("display_name").notNull(),
    // FB Page ID / LINE OA basic ID — provider-side identifier for this channel.
    externalId: text("external_id").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("channels_tenant_type_external_uq").on(
      t.tenantId,
      t.type,
      t.externalId,
    ),
    index("channels_tenant_idx").on(t.tenantId),
  ],
);

/**
 * Facebook/Messenger credentials. Tokens are ENCRYPTED at rest — never env vars
 * (risk #7: one env token = one page only). One row per connected Page.
 */
export const facebookConnections = pgTable(
  "facebook_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull(),
    pageName: text("page_name"),
    // Encrypted blobs (app-layer AES-GCM). Column holds ciphertext, not plaintext.
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'`),
    status: connectionStatusEnum("status").notNull().default("CONNECTED"),
    lastError: text("last_error"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("fb_conn_tenant_page_uq").on(t.tenantId, t.pageId),
    index("fb_conn_tenant_idx").on(t.tenantId),
  ],
);

/** LINE OA credentials, same encryption + status rules as Facebook. */
export const lineConnections = pgTable(
  "line_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    basicId: text("basic_id"),
    channelSecretEncrypted: text("channel_secret_encrypted").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    status: connectionStatusEnum("status").notNull().default("CONNECTED"),
    lastError: text("last_error"),
    // Remaining monthly push/broadcast quota mirror for the dashboard meter (risk #4).
    quotaMeta: jsonb("quota_meta"),
    ...timestamps,
  },
  (t) => [
    unique("line_conn_channel_uq").on(t.channelId),
    index("line_conn_tenant_idx").on(t.tenantId),
  ],
);
