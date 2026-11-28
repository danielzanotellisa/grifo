import type { AccountPurge } from "@app/platform";
import { inArray, like, lt, or } from "drizzle-orm";
import { accounts, outgoingMail, rateLimits, sessions, users, verifications } from "./schema";

/**
 * The accounts deleted before the cutoff, and their removal from the identity schema once every
 * module has purged their data (`user/purge`). It runs on the admin connection, which is the only
 * one besides the authentication role that can read the schema.
 */
export const accountPurge: AccountPurge = {
  async expired(db, cutoff) {
    const rows = await db.select({ id: users.id }).from(users).where(lt(users.deletedAt, cutoff));
    return rows.map((row) => row.id);
  },

  async remove(db, ownerIds) {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ email: users.email })
        .from(users)
        .where(inArray(users.id, ownerIds));
      const emails = rows.map((row) => row.email);
      if (emails.length > 0) {
        await tx.delete(outgoingMail).where(inArray(outgoingMail.toEmail, emails));
        await tx.delete(verifications).where(inArray(verifications.identifier, emails));
      }
      await tx
        .delete(rateLimits)
        .where(or(...ownerIds.map((id) => like(rateLimits.key, `%:${id}`))));
      await tx.delete(sessions).where(inArray(sessions.userId, ownerIds));
      await tx.delete(accounts).where(inArray(accounts.userId, ownerIds));
      await tx.delete(users).where(inArray(users.id, ownerIds));
    });
  },
};
