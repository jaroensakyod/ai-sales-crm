import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { owners, tenants } from "@/db/schema";

type Provider = "LINE" | "FACEBOOK";

/** Look up an email/password owner by email (providerId = lowercased email). */
export async function getEmailOwner(db: DbClient, email: string) {
  const [row] = await db
    .select()
    .from(owners)
    .where(
      and(eq(owners.provider, "EMAIL"), eq(owners.providerId, email.toLowerCase())),
    );
  return row ?? null;
}

/** Create an email/password owner. Caller hashes the password first. */
export async function createEmailOwner(
  db: DbClient,
  input: { email: string; passwordHash: string; displayName?: string },
) {
  const email = input.email.toLowerCase();
  const [row] = await db
    .insert(owners)
    .values({
      provider: "EMAIL",
      providerId: email,
      email,
      displayName: input.displayName ?? email,
      passwordHash: input.passwordHash,
    })
    .returning();
  return row;
}

export type SocialProfile = {
  provider: Provider;
  providerId: string;
  displayName?: string | null;
  email?: string | null;
  pictureUrl?: string | null;
};

/**
 * Find-or-create the owner for a social profile. The same (provider, providerId)
 * always maps to one owner, so signing in again returns the existing account and
 * refreshes the display name/picture.
 */
export async function upsertOwner(db: DbClient, p: SocialProfile) {
  const [existing] = await db
    .select()
    .from(owners)
    .where(
      and(eq(owners.provider, p.provider), eq(owners.providerId, p.providerId)),
    );
  if (existing) {
    await db
      .update(owners)
      .set({
        displayName: p.displayName ?? existing.displayName,
        pictureUrl: p.pictureUrl ?? existing.pictureUrl,
        email: p.email ?? existing.email,
        updatedAt: new Date(),
      })
      .where(eq(owners.id, existing.id));
    return existing;
  }
  const [row] = await db
    .insert(owners)
    .values({
      provider: p.provider,
      providerId: p.providerId,
      displayName: p.displayName,
      email: p.email,
      pictureUrl: p.pictureUrl,
    })
    .returning();
  return row;
}

export async function getOwner(db: DbClient, id: string) {
  const [row] = await db.select().from(owners).where(eq(owners.id, id));
  return row ?? null;
}

/** Stores this owner created (newest first). */
export async function listOwnerTenants(db: DbClient, ownerId: string) {
  return db
    .select()
    .from(tenants)
    .where(eq(tenants.ownerId, ownerId))
    .orderBy(desc(tenants.createdAt));
}
