import type { Tx } from "./db/client";

/**
 * In-process domain events, dispatched synchronously INSIDE the publisher's transaction.
 * Lets lower modules (library) trigger reactions in higher ones (annotation, outline, study)
 * without importing them. Handlers are registered once, at the app composition root.
 */
export type DomainEvent =
  | { type: "library.subjectDeleted"; ownerId: string; subjectId: string }
  | { type: "library.documentDeleted"; ownerId: string; documentId: string }
  | { type: "annotation.highlightDeleted"; ownerId: string; highlightId: string }
  | { type: "outline.nodeDeleted"; ownerId: string; nodeId: string };

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
