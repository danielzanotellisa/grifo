import type { Tx } from "./db/client";

/**
 * In-process domain events, dispatched synchronously INSIDE the publisher's transaction.
 * Lets lower modules (library) trigger reactions in higher ones (annotation, outline, study)
 * without importing them. Handlers are registered once, at the app composition root.
 */
export type DomainEvent =
  | { type: "library.subjectDeleted"; ownerId: string; subjectId: string; rootId: string }
  | { type: "library.documentDeleted"; ownerId: string; documentId: string; rootId: string }
  | { type: "annotation.highlightPlaced"; ownerId: string; highlightId: string; documentId: string }
  | {
      type: "annotation.highlightIgnored";
      ownerId: string;
      highlightId: string;
      documentId: string;
    }
  | { type: "annotation.highlightDeleted"; ownerId: string; highlightId: string; rootId: string }
  | { type: "outline.nodeDeleted"; ownerId: string; nodeId: string; rootId: string };

/**
 * `highlightPlaced` (a highlight now needs an outline node) and `highlightIgnored` (its category became
 * IGNORE, so the node leaves) carry no root: the outline uses the highlight id (ADR 0033).
 *
 * Deletion events carry `rootId`, the item the user deleted, so the rows a reaction soft-deletes get
 * the same `deleted_root_id` and come back together on restore.
 */
type Handler<E extends DomainEvent> = (tx: Tx, event: E) => Promise<void>;

export interface EventBus {
  publish(tx: Tx, event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEvent["type"]>(
    type: T,
    handler: Handler<Extract<DomainEvent, { type: T }>>,
  ): void;
}

export function createInProcessEventBus(): EventBus {
  const handlers = new Map<DomainEvent["type"], Handler<DomainEvent>[]>();
  return {
    async publish(tx, event) {
      for (const handler of handlers.get(event.type) ?? []) await handler(tx, event);
    },
    subscribe(type, handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler as Handler<DomainEvent>);
      handlers.set(type, list);
    },
  };
}
