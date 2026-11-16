import type { AuthMail } from "@app/identity";

const OUTBOX_LIMIT = 100;

/** The emails the app has "sent" outside production, newest last. Tests and local development read it. */
export const outbox: AuthMail[] = [];

/**
 * Stopgap until the real sender (SMTP through the job queue) exists. Outside production it logs the
 * link and keeps it in the outbox; in production it refuses to be used, so a deployment without a
 * sender fails at startup instead of leaking verification links into a log.
 */
export function assertMailerReady(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("No email sender is configured: SMTP through the job queue is not built yet");
  }
}

const record = (kind: string, mail: AuthMail) => {
  console.info(`[auth email: ${kind}] ${mail.to} ${mail.url}`);
  outbox.push(mail);
  if (outbox.length > OUTBOX_LIMIT) outbox.shift();
};

export const authMailer = {
  sendVerificationEmail: async (mail: AuthMail) => record("verification", mail),
  sendResetPassword: async (mail: AuthMail) => record("reset", mail),
};
