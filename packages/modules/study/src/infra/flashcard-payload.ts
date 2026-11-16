import { DomainError } from "@app/platform";
import { z } from "zod";

const create = z.object({ id: z.uuid(), sourceNodeId: z.uuid(), front: z.string() }).strict();
const edit = z.object({ id: z.uuid(), front: z.string(), back: z.string() }).strict();
const refresh = z.object({ id: z.uuid(), refreshFromSource: z.literal(true) }).strict();
const remove = z.object({ id: z.uuid() });

export type FlashcardCommand =
  | ({ kind: "create" } & z.infer<typeof create>)
  | ({ kind: "edit" } & z.infer<typeof edit>)
  | ({ kind: "refresh" } & z.infer<typeof refresh>);

const invalid = () =>
  new DomainError("FLASHCARD_INVALID", "The data of the mutation is invalid", 422);

/** The shape of `data` tells the operation of an upsert (`docs/specs/flashcard`, Sync). */
export function parseFlashcardCommand(data: unknown): FlashcardCommand {
  for (const [kind, schema] of [
    ["create", create],
    ["edit", edit],
    ["refresh", refresh],
  ] as const) {
    const parsed = schema.safeParse(data);
    if (parsed.success) return { kind, ...parsed.data } as FlashcardCommand;
  }
  throw invalid();
}

export function parseFlashcardDelete(data: unknown): { id: string } {
  const parsed = remove.safeParse(data);
  if (!parsed.success) throw invalid();
  return parsed.data;
}
