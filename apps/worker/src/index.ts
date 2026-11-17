import { createAuthDb, createMailOutbox } from "@app/identity";
import { createDocumentValidation } from "@app/library";
import { createDb, createS3Storage, s3ConfigFromEnv } from "@app/platform";
import { run, type Task, type TaskList } from "graphile-worker";
import nodemailer from "nodemailer";
import { createExpireMailTask, createSendEmailTask } from "./tasks/auth-mail";
import { createValidateDocumentTask } from "./tasks/document-validate";
import { inspectPdf } from "./tasks/pdf-inspect";

/**
 * Worker entry point (ADR 0029). Task names must match `TaskName` in @app/platform.
 * Each handler: read in a short withUser transaction -> do the slow work -> write results + recordChange.
 */
const notImplemented =
  (name: string): Task =>
  async (_payload, helpers) => {
    helpers.logger.warn(`${name}: not implemented yet (see its spec)`);
  };

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
};

// The authentication tasks read the identity schema, which only the authentication role can (ADR 0035).
const outbox = createMailOutbox(createAuthDb(requiredEnv("DATABASE_AUTH_URL")));
const sendEmail = createSendEmailTask({
  outbox,
  from: requiredEnv("MAIL_FROM"),
  transport: nodemailer.createTransport({
    host: requiredEnv("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT ?? 1025),
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } }
      : {}),
  }),
});
const expireMail = createExpireMailTask({ outbox });

const validateDocument = createValidateDocumentTask({
  validation: createDocumentValidation({
    db: createDb(requiredEnv("DATABASE_URL")),
    storage: createS3Storage(s3ConfigFromEnv(process.env)),
    inspect: inspectPdf,
  }),
});

const taskList: TaskList = {
  "document.validate": async (payload, helpers) => validateDocument(payload, helpers),
  "document.deepScan": notImplemented("document.deepScan"),
  "export.render": notImplemented("export.render"),
  "trash.purge": notImplemented("trash.purge"),
  "backup.restoreTest": notImplemented("backup.restoreTest"),
  "storage.integrityCheck": notImplemented("storage.integrityCheck"),
  "auth.sendEmail": async (payload) => sendEmail(payload),
  "auth.expireMail": async () => expireMail(),
};

// minute hour day-of-month month day-of-week task
const crontab = [
  "0 4 * * * trash.purge",
  "0 5 * * 0 storage.integrityCheck",
  "0 6 1 * * backup.restoreTest",
  "0 * * * * auth.expireMail",
].join("\n");

const runner = await run({
  connectionString: process.env.DATABASE_URL ?? "",
  concurrency: 4,
  taskList,
  crontab,
});

await runner.promise;
