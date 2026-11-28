import type { SyncHandler } from "@app/platform";
import { createCategorySyncHandler } from "./infra/category-sync";
import { createHighlightSyncHandler, type HighlightDeps } from "./infra/highlight-sync";
export type { Category } from "./domain/category";
export { DEFAULT_CATEGORIES, isHexColor } from "./domain/category";
export type { Highlight } from "./domain/highlight";
export { normalizeQuoteText } from "./domain/highlight";
export { createCategorySyncHandler } from "./infra/category-sync";
export { createHighlightSyncHandler } from "./infra/highlight-sync";
export type { DocumentStatePort, HighlightDeps } from "./infra/highlight-sync";
export { createHighlightTrashParticipant } from "./infra/highlight-trash";
export { registerAnnotationReactions } from "./infra/reactions";
export { compareHighlightOrder, loadHighlightOrderKeys } from "./infra/order-key";
export type { HighlightOrderKey } from "./infra/order-key";
export { categoryTrashParticipant } from "./infra/category-trash";
export { highlightSource } from "./infra/highlight-source";
export { seedDefaultCategories } from "./infra/seed";

/** The category and highlight sync handlers, which share the event bus and the library port. */
export function createAnnotationSyncHandlers(deps: HighlightDeps): SyncHandler[] {
  return [createCategorySyncHandler({ events: deps.events }), createHighlightSyncHandler(deps)];
}
export { annotationPurgeParticipant } from "./infra/purge";
export { highlightPages } from "./infra/highlight-pages";
export { highlightDetails } from "./infra/highlight-details";
export type { HighlightDetails } from "./infra/highlight-details";
export { highlightMarks } from "./infra/highlight-marks";
export type { HighlightMark } from "./infra/highlight-marks";
