import type { MailOutbox } from "@app/identity";
import { mailText } from "./mail-text";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPIRY_MS = 24 * 60 * 60 * 1000;

type Transport = {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
};

/**
 * Sends the message of an outbox row, then deletes the row (ADR 0035). The payload holds only the
 * row id: the link, which carries a token, never leaves the `identity` schema until it is mailed.
 * A missing row means the job already ran. A failed send throws, so Graphile retries and the row stays.
 */
export function createSendEmailTask(deps: {
  outbox: MailOutbox;
  transport: Transport;
  from: string;
}) {
  return async (payload: unknown): Promise<void> => {
    const mailId = (payload as { mailId?: unknown } | null)?.mailId;
    if (typeof mailId !== "string" || !UUID.test(mailId)) {
      throw new Error("auth.sendEmail needs a valid mailId in its payload");
    }

    const mail = await deps.outbox.get(mailId);
    if (!mail) return;

    const { subject, text } = mailText(mail.kind, mail.url);
    await deps.transport.sendMail({ from: deps.from, to: mail.to, subject, text });
    await deps.outbox.remove(mailId);
  };
}

/** Deletes the messages older than 24 hours: their tokens have expired, and a failed send must not keep a link forever. */
export function createExpireMailTask(deps: { outbox: MailOutbox }) {
  return async (): Promise<void> => {
    await deps.outbox.expireOlderThan(new Date(Date.now() - EXPIRY_MS));
  };
}
