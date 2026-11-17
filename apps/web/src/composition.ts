import {
  categoryTrashParticipant,
  createAnnotationSyncHandlers,
  createHighlightTrashParticipant,
  registerAnnotationReactions,
  seedDefaultCategories,
} from "@app/annotation";
import {
  createAuth,
  createAuthDb,
  createMailOutbox,
  type Auth,
  type AuthMail,
  type MailKind,
} from "@app/identity";
import {
  createDocumentSyncHandler,
  createUploads,
  createSubjectSyncHandler,
  documentIsLive,
  documentState,
  documentTrashParticipant,
  subjectTrashParticipant,
} from "@app/library";
import {
  createOutlineSyncHandler,
  createOutlineTrashParticipant,
  nodeSource,
  registerOutlineReactions,
} from "@app/outline";
import {
  createFlashcardSyncHandler,
  createFlashcardTrashParticipant,
  registerStudyReactions,
} from "@app/study";
import {
  allowAll,
  createDb,
  createInProcessEventBus,
  createS3Storage,
  createSyncEngine,
  createTrash,
  enqueueJob,
  s3ConfigFromEnv,
  withUser,
} from "@app/platform";
import { categoryName } from "./lib/i18n/category-names";

/**
 * Composition root: the only place that wires infrastructure to modules.
 * Event reactions, sync handlers and trash participants of every module are registered here.
 */
export const db = createDb(process.env.DATABASE_URL ?? "");
export const events = createInProcessEventBus();
export const entitlements = allowAll;

registerAnnotationReactions(events);
registerOutlineReactions(events);
registerStudyReactions(events);

export const syncEngine = createSyncEngine([
  createSubjectSyncHandler({ events }),
  createDocumentSyncHandler({ events }),
  ...createAnnotationSyncHandlers({ events, documentState }),
  createOutlineSyncHandler({ documentIsLive }),
  createFlashcardSyncHandler({ nodeSource }),
]);

export const trash = createTrash([
  subjectTrashParticipant,
  documentTrashParticipant,
  createHighlightTrashParticipant({ documentState }),
  categoryTrashParticipant,
  createOutlineTrashParticipant({ documentIsLive }),
  createFlashcardTrashParticipant({ documentIsLive }),
]);

/** The pool of the authentication role: the only connection that can read the identity schema (ADR 0034). */
export const authDb = createAuthDb(process.env.DATABASE_AUTH_URL ?? "");

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
};

export const appUrl = (): string => requiredEnv("APP_URL");

let uploads: ReturnType<typeof createUploads> | undefined;

/** Built on first use: the storage settings are only needed once someone uploads or opens a PDF. */
export function getUploads(): ReturnType<typeof createUploads> {
  uploads ??= createUploads({ db, storage: createS3Storage(s3ConfigFromEnv(process.env)) });
  return uploads;
}

let auth: Auth | undefined;

/**
 * Writes the message to the outbox of the identity schema, then enqueues the job that sends it. The
 * job holds only ids: the link carries a token and must not be readable by the application role (ADR 0035).
 */
const deliver =
  (kind: MailKind, outbox: ReturnType<typeof createMailOutbox>) => async (mail: AuthMail) => {
    const mailId = await outbox.add({ to: mail.to, kind, url: mail.url });
    await withUser(db, mail.userId, (tx) =>
      enqueueJob(tx, "auth.sendEmail", { ownerId: mail.userId, mailId }),
    );
  };

/** Built on first use and at startup (`instrumentation.ts`), so a missing secret or database stops the app early. */
export function getAuth(): Auth {
  if (!auth) {
    requiredEnv("DATABASE_AUTH_URL");
    const outbox = createMailOutbox(authDb);
    auth = createAuth({
      db: authDb,
      secret: requiredEnv("BETTER_AUTH_SECRET"),
      baseURL: appUrl(),
      sendVerificationEmail: deliver("verification", outbox),
      sendResetPassword: deliver("reset", outbox),
      onSignIn: async (userId) => {
        await withUser(db, userId, (tx) => seedDefaultCategories(tx, userId, categoryName));
      },
    });
  }
  return auth;
}
