import {
  categoryTrashParticipant,
  createAnnotationSyncHandlers,
  createHighlightTrashParticipant,
  registerAnnotationReactions,
  seedDefaultCategories,
} from "@app/annotation";
import { createAuth, createAuthDb, type Auth } from "@app/identity";
import {
  createDocumentSyncHandler,
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
  createSyncEngine,
  createTrash,
  withUser,
} from "@app/platform";
import { categoryName } from "./lib/i18n/category-names";
import { assertMailerReady, authMailer } from "./mailer";

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

let auth: Auth | undefined;

/** Built on first use and at startup (`instrumentation.ts`), so a missing secret or sender stops the app early. */
export function getAuth(): Auth {
  if (!auth) {
    assertMailerReady();
    auth = createAuth({
      db: authDb,
      secret: requiredEnv("BETTER_AUTH_SECRET"),
      baseURL: appUrl(),
      sendVerificationEmail: authMailer.sendVerificationEmail,
      sendResetPassword: authMailer.sendResetPassword,
      onSignIn: async (userId) => {
        await withUser(db, userId, (tx) => seedDefaultCategories(tx, userId, categoryName));
      },
    });
  }
  return auth;
}
