import { allowAll, createDb, createInProcessEventBus } from "@app/platform";

/**
 * Composition root: the only place that wires infrastructure to modules.
 * Register event handlers here (e.g. library.documentDeleted -> annotation/outline/study soft-delete).
 */
export const db = createDb(process.env.DATABASE_URL ?? "");
export const events = createInProcessEventBus();
export const entitlements = allowAll;
