import { createExports, renderPdf } from "@app/export";
import { createAuthDb, createMailOutbox } from "@app/identity";
import { createDeepScan, createDocumentValidation } from "@app/library";
import { createDb, createS3Storage, s3ConfigFromEnv } from "@app/platform";
import { parseCronItems, run } from "graphile-worker";
import nodemailer from "nodemailer";
import { createExpireMailTask, createSendEmailTask } from "./tasks/auth-mail";
import { createClamavScanner } from "./tasks/clamav";
import { createDeepScanTask } from "./tasks/document-deep-scan";
import { createExportRenderTask } from "./tasks/export-render";
import { buildPurge } from "./purge-setup";
import { createValidateDocumentTask } from "./tasks/document-validate";
import { inspectPdf } from "./tasks/pdf-inspect";
import { createPurgeTask } from "./tasks/trash-purge";
import { createTaskList, cronItems } from "./schedule";

/**
 * Worker entry point (ADR 0029). Task names must match `TaskName` in @app/platform.
 * Each handler: read in a short withUser transaction -> do the slow work -> write results + recordChange.
 */
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

const db = createDb(requiredEnv("DATABASE_URL"));
const storage = createS3Storage(s3ConfigFromEnv(process.env));
const validateDocument = createValidateDocumentTask({
  validation: createDocumentValidation({ db, storage, inspect: inspectPdf }),
});
const deepScan = createDeepScanTask({
  scan: createDeepScan({
    db,
    storage,
    scan: createClamavScanner({
      host: requiredEnv("CLAMAV_HOST"),
      port: Number(process.env.CLAMAV_PORT ?? 3310),
    }),
  }),
});

const exportRender = createExportRenderTask({
  exports: createExports({
    db,
    storage,
    renderPdf: (document) => renderPdf(requiredEnv("GOTENBERG_URL"), document),
  }),
});

// The purge works across owners, so it is the one task that uses the admin connection (ADR 0039).
const purge = createPurgeTask({
  db: createDb(requiredEnv("DATABASE_MIGRATOR_URL")),
  purge: buildPurge(storage),
});

const taskList = createTaskList({
  validateDocument: async (payload, helpers) => validateDocument(payload, helpers),
  deepScan: async (payload, helpers) => deepScan(payload, helpers),
  exportRender: async (payload, helpers) => exportRender(payload, helpers),
  purge: async () => purge(),
  sendEmail: async (payload) => sendEmail(payload),
  expireMail: async () => expireMail(),
});

const runner = await run({
  connectionString: process.env.DATABASE_URL ?? "",
  concurrency: 4,
  taskList,
  parsedCronItems: parseCronItems(cronItems),
});

await runner.promise;
