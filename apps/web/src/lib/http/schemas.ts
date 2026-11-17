import { z } from "zod";
import { invalidInput } from "./body";

export const MAX_MUTATIONS_PER_PUSH = 100;
export const MAX_PUSH_BODY_BYTES = 1024 * 1024;

const mutation = z.object({
  mutationId: z.uuid(),
  entity: z.string().min(1),
  op: z.enum(["upsert", "delete"]),
  data: z.record(z.string(), z.unknown()),
});

const pushBody = z.object({ mutations: z.array(mutation).min(1).max(MAX_MUTATIONS_PER_PUSH) });

export function parsePushBody(body: unknown) {
  const parsed = pushBody.safeParse(body);
  if (!parsed.success) throw invalidInput(z.prettifyError(parsed.error));
  return parsed.data.mutations;
}

/** `since` of a pull: a non-negative integer; absent means the first sync. */
export function parseSince(value: string | null): number {
  if (value === null) return 0;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw invalidInput("since must be a non-negative integer");
  }
  return Number(value);
}
