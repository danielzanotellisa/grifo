import {
  createDocumentSyncHandler,
  createSubjectSyncHandler,
  documentIsLive,
  documentTrashParticipant,
  subjectTrashParticipant,
} from "@app/library";
import {
  createOutlineSyncHandler,
  createOutlineTrashParticipant,
  registerOutlineReactions,
} from "@app/outline";
import {
  allowAll,
  createDb,
  createInProcessEventBus,
  createSyncEngine,
  createTrash,
} from "@app/platform";

/**
 * Composition root: the only place that wires infrastructure to modules.
 * Event reactions, sync handlers and trash participants of every module are registered here.
 */
export const db = createDb(process.env.DATABASE_URL ?? "");
export const events = createInProcessEventBus();
export const entitlements = allowAll;

registerOutlineReactions(events);

export const syncEngine = createSyncEngine([
  createSubjectSyncHandler({ events }),
  createDocumentSyncHandler({ events }),
  createOutlineSyncHandler({ documentIsLive }),
]);

export const trash = createTrash([
  subjectTrashParticipant,
  documentTrashParticipant,
  createOutlineTrashParticipant({ documentIsLive }),
]);
