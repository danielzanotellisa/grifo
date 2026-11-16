import type { Db, Tx } from "./db/client";
import { withUser } from "./db/with-user";
import { notFound } from "./errors";
import type { SyncChange } from "./sync/engine";
import { recordChange, type SyncEntity } from "./sync/record-change";

export const TRASH_WINDOW_DAYS = 30;

export type TrashItem = { entity: SyncEntity; id: string; label: string; deletedAt: Date };

/**
 * What a module provides for the trash. Registered at the composition root, so the platform never
 * imports a module. `list` returns the module's trash items (rows whose `deleted_root_id` is their
 * own id) with a label to show; `restore` clears every row of the module deleted under `rootId`,
 * throws `PARENT_DELETED` before writing when `rootId` is one of its items whose parent is not live,
 * and returns the changes it made.
 */
export type TrashParticipant = {
  entity: SyncEntity;
  list(tx: Tx, ownerId: string): Promise<TrashItem[]>;
  restore(tx: Tx, ownerId: string, rootId: string, now: Date): Promise<SyncChange[]>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function createTrash(participants: TrashParticipant[]) {
  return {
    /** Trash items inside the window, newest first. */
    async list(db: Db, ownerId: string, now: Date = new Date()): Promise<TrashItem[]> {
      const cutoff = now.getTime() - TRASH_WINDOW_DAYS * DAY_MS;
      const items = await withUser(db, ownerId, async (tx) => {
        const all: TrashItem[] = [];
        for (const participant of participants) all.push(...(await participant.list(tx, ownerId)));
        return all;
      });
      return items
        .filter((item) => item.deletedAt.getTime() >= cutoff)
        .sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
    },

    /** Restores a trash item and everything deleted with it, in one transaction. */
    async restore(
      db: Db,
      ownerId: string,
      rootId: string,
      now: Date = new Date(),
    ): Promise<SyncChange[]> {
      return withUser(db, ownerId, async (tx) => {
        const changes: SyncChange[] = [];
        for (const participant of participants) {
          changes.push(...(await participant.restore(tx, ownerId, rootId, now)));
        }
        if (changes.length === 0) throw notFound("trash item");
        for (const change of changes) await recordChange(tx, { ownerId, ...change });
        return changes;
      });
    },
  };
}
