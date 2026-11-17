import { createAuthDb, createMailOutbox } from "@app/identity";
import { newId } from "@app/platform";
import nodemailer from "nodemailer";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createExpireMailTask, createSendEmailTask } from "./auth-mail";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const outbox = createMailOutbox(createAuthDb(process.env.DATABASE_AUTH_URL!));

afterAll(() => admin.end());

const FROM = "Grifo <no-reply@grifo.test>";
const address = () => `worker-${newId()}@example.com`;
const link = (kind: string) => `http://localhost:3000/api/auth/${kind}?token=abc123`;

/** The real nodemailer in JSON mode: it builds the message without touching the network. */
function recordingTransport() {
  const real = nodemailer.createTransport({ jsonTransport: true });
  const sent: {
    from: { address: string };
    to: { address: string }[];
    subject: string;
    text: string;
  }[] = [];
  return {
    sent,
    transport: {
      sendMail: async (message: Parameters<typeof real.sendMail>[0]) => {
        const info = await real.sendMail(message);
        sent.push(JSON.parse(info.message));
        return info;
      },
    },
  };
}

describe("auth.sendEmail", () => {
  it("[user/email#AC-3] sends one message with the link and deletes the row, and a rerun sends nothing", async () => {
    const to = address();
    const mailId = await outbox.add({ to, kind: "verification", url: link("verify-email") });
    const { sent, transport } = recordingTransport();
    const task = createSendEmailTask({ outbox, transport, from: FROM });

    await task({ ownerId: newId(), mailId });
    await expect(task({ ownerId: newId(), mailId })).resolves.toBeUndefined();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to.map((t) => t.address)).toEqual([to]);
    expect(sent[0]!.from.address).toBe("no-reply@grifo.test");
    expect(sent[0]!.text).toContain(link("verify-email"));
    expect(sent[0]!.subject.length).toBeGreaterThan(0);
    expect(await outbox.get(mailId)).toBeUndefined();
  });

  it("[user/email#AC-3] words a reset message differently from a verification", async () => {
    const { sent, transport } = recordingTransport();
    const task = createSendEmailTask({ outbox, transport, from: FROM });
    const verification = await outbox.add({
      to: address(),
      kind: "verification",
      url: link("verify-email"),
    });
    const reset = await outbox.add({ to: address(), kind: "reset", url: link("reset-password") });

    await task({ ownerId: newId(), mailId: verification });
    await task({ ownerId: newId(), mailId: reset });

    expect(sent[0]!.subject).not.toBe(sent[1]!.subject);
    expect(sent[1]!.text).toContain(link("reset-password"));
  });

  it("[user/email#AC-4] throws when the send fails, so the job is retried, and keeps the row", async () => {
    const mailId = await outbox.add({ to: address(), kind: "reset", url: link("reset-password") });
    const task = createSendEmailTask({
      outbox,
      from: FROM,
      transport: { sendMail: async () => Promise.reject(new Error("smtp down")) },
    });

    await expect(task({ ownerId: newId(), mailId })).rejects.toThrow("smtp down");

    expect(await outbox.get(mailId)).toBeDefined();
  });

  it("rejects a payload without a valid mail id", async () => {
    const { transport } = recordingTransport();
    const task = createSendEmailTask({ outbox, transport, from: FROM });

    await expect(task({ ownerId: newId() })).rejects.toThrow(/mailId/);
    await expect(task({ ownerId: newId(), mailId: "nope" })).rejects.toThrow(/mailId/);
  });
});

describe("auth.expireMail", () => {
  it("[user/email#AC-5] deletes only the rows older than 24 hours", async () => {
    const [oldId, freshId] = [
      await outbox.add({ to: address(), kind: "reset", url: link("reset-password") }),
      await outbox.add({ to: address(), kind: "reset", url: link("reset-password") }),
    ];
    await admin.query(
      `update identity.outgoing_mail set created_at = now() - interval '25 hours' where id = $1`,
      [oldId],
    );

    await createExpireMailTask({ outbox })();

    expect(await outbox.get(oldId)).toBeUndefined();
    expect(await outbox.get(freshId)).toBeDefined();
  });
});
