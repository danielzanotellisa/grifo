import { newId } from "@app/platform";
import { eq, lt } from "drizzle-orm";
import type { AuthDb } from "./db";
import { outgoingMail } from "./schema";

export type MailKind = "verification" | "reset";
export type OutgoingMail = { to: string; kind: MailKind; url: string };
export type MailOutbox = ReturnType<typeof createMailOutbox>;

/** The messages waiting to be sent. Used with the authentication pool, never with the application role. */
export function createMailOutbox(db: AuthDb) {
  return {
    async add(mail: OutgoingMail): Promise<string> {
      const id = newId();
      await db
        .insert(outgoingMail)
        .values({ id, toEmail: mail.to, kind: mail.kind, url: mail.url });
      return id;
    },

    async get(id: string): Promise<OutgoingMail | undefined> {
      const [row] = await db.select().from(outgoingMail).where(eq(outgoingMail.id, id));
      return row && { to: row.toEmail, kind: row.kind as MailKind, url: row.url };
    },

    async remove(id: string): Promise<void> {
      await db.delete(outgoingMail).where(eq(outgoingMail.id, id));
    },

    /** Deletes the messages created before `before`; returns how many. */
    async expireOlderThan(before: Date): Promise<number> {
      const removed = await db
        .delete(outgoingMail)
        .where(lt(outgoingMail.createdAt, before))
        .returning({ id: outgoingMail.id });
      return removed.length;
    },
  };
}
