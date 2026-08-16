import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { tenantId } from "./tenants";

/**
 * Chat tags = intent/topic control for AI replies (the "TAG" in RAG+TAG).
 * When an inbound message matches a tag's keywords, the tag's `guidance` is
 * injected into the LLM prompt to steer the answer precisely (more controllable
 * than free RAG). Works on every channel via the shared pipeline.
 */
export const chatTags = pgTable(
  "chat_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    keywords: text("keywords").array().notNull().default(sql`'{}'`),
    guidance: text("guidance").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("chat_tags_tenant_idx").on(t.tenantId)],
);
