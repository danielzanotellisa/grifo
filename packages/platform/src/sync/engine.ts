import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Db, Tx } from "../db/client";
import { withUser } from "../db/with-user";
import { DomainError } from "../errors";
import { lockOwner, recordChange, type SyncEntity } from "./record-change";
import { changeLog, processedMutations } from "./schema";

export type SyncOp = "upsert" | "delete";

export type SyncChange = { entity: SyncEntity; entityId: string; op: SyncOp };

export type Mutation = { mutationId: string; entity: string; op: SyncOp; data: unknown };

/**
 * What a module provides for one synced entity. Registered at the composition root, so the
 * platform never imports a module. `apply` validates `data`, writes, and returns every change it
 * made (cascades included); the engine records them. `read` returns the live entities by id.
 */
export type SyncHandler = {
  entity: SyncEntity;
  apply(tx: Tx, ownerId: string, mutation: { op: SyncOp; data: unknown }): Promise<SyncChange[]>;
  read(tx: Tx, ownerId: string, ids: string[]): Promise<Map<string, unknown>>;
};

export type PushResult = {
  mutationId: string;
  status: "applied" | "duplicate" | "rejected";
  code?: string;
};

export type PulledChange = { entity: SyncEntity; entityId: string; op: SyncOp; data?: unknown };

type Outcome = { status: "applied" } | { status: "rejected"; code: string };

const PAGE_SIZE = 500;

export function createSyncEngine(handlers: SyncHandler[]) {
  const byEntity = new Map<string, SyncHandler>(handlers.map((h) => [h.entity, h]));

  async function applyOne(tx: Tx, ownerId: string, m: Mutation): Promise<PushResult> {
    await lockOwner(tx, ownerId);

    const [prior] = await tx
      .select({ outcome: processedMutations.outcome })
      .from(processedMutations)
      .where(
        and(
          eq(processedMutations.ownerId, ownerId),
          eq(processedMutations.mutationId, m.mutationId),
        ),
      );
    if (prior) {
      const outcome = prior.outcome as Outcome;
      return outcome.status === "rejected"
        ? { mutationId: m.mutationId, status: "rejected", code: outcome.code }
        : { mutationId: m.mutationId, status: "duplicate" };
    }

    const outcome = await run(tx, ownerId, m);
    await tx.insert(processedMutations).values({ ownerId, mutationId: m.mutationId, outcome });
    return outcome.status === "rejected"
      ? { mutationId: m.mutationId, status: "rejected", code: outcome.code }
      : { mutationId: m.mutationId, status: "applied" };
  }

  async function run(tx: Tx, ownerId: string, m: Mutation): Promise<Outcome> {
    const handler = byEntity.get(m.entity);
    if (!handler) return { status: "rejected", code: "SYNC_ENTITY_UNKNOWN" };

    let changes: SyncChange[];
    try {
      changes = await tx.transaction((savepoint) => handler.apply(savepoint, ownerId, m));
    } catch (error) {
      if (error instanceof DomainError) return { status: "rejected", code: error.code };
      throw error;
    }
    for (const change of changes) await recordChange(tx, { ownerId, ...change });
    return { status: "applied" };
  }

  const latestSeq = async (tx: Tx, ownerId: string): Promise<number> => {
    const { rows } = await tx.execute(
      sql`select coalesce(max(seq), 0)::int as seq from platform.change_log where owner_id = ${ownerId}`,
    );
    return (rows[0] as { seq: number }).seq;
  };

  return {
    /** Applies the batch in order, one transaction per mutation. */
    async push(db: Db, ownerId: string, mutations: Mutation[]) {
      const results: PushResult[] = [];
      for (const m of mutations)
        results.push(await withUser(db, ownerId, (tx) => applyOne(tx, ownerId, m)));
      const cursor = await withUser(db, ownerId, (tx) => latestSeq(tx, ownerId));
      return { results, cursor };
    },

    /** One page of changes after `since`, collapsed per entity; deletions and dead entities are tombstones. */
    async pull(db: Db, ownerId: string, since: number) {
      return withUser(db, ownerId, async (tx) => {
        const rows = await tx
          .select()
          .from(changeLog)
          .where(and(eq(changeLog.ownerId, ownerId), gt(changeLog.seq, since)))
          .orderBy(asc(changeLog.seq))
          .limit(PAGE_SIZE + 1);
        const page = rows.slice(0, PAGE_SIZE);
        const cursor = page.at(-1)?.seq ?? since;

        const latest = new Map<string, (typeof page)[number]>();
        for (const row of page) latest.set(`${row.entity}:${row.entityId}`, row);
        const winners = [...latest.values()].sort((a, b) => a.seq - b.seq);

        const live = new Map<string, Map<string, unknown>>();
        for (const entity of new Set(
          winners.filter((w) => w.op === "upsert").map((w) => w.entity),
        )) {
          const handler = byEntity.get(entity);
          if (!handler) throw new Error(`No sync handler registered for entity ${entity}`);
          const ids = winners
            .filter((w) => w.op === "upsert" && w.entity === entity)
            .map((w) => w.entityId);
          live.set(entity, await handler.read(tx, ownerId, ids));
        }

        const changes: PulledChange[] = winners.map((w) => {
          const entity = w.entity as SyncEntity;
          const data = w.op === "upsert" ? live.get(w.entity)?.get(w.entityId) : undefined;
          return data === undefined
            ? { entity, entityId: w.entityId, op: "delete" }
            : { entity, entityId: w.entityId, op: "upsert", data };
        });
        return { changes, cursor, more: rows.length > PAGE_SIZE };
      });
    },
  };
}
