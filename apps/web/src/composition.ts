import {
  categoryTrashParticipant,
  createAnnotationSyncHandlers,
  createHighlightTrashParticipant,
  registerAnnotationReactions,
} from "@app/annotation";
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
} from "@app/platform";

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
