import type { createDocumentValidation } from "@app/library";
import type { JobHelpers } from "graphile-worker";
import { z } from "zod";

const payload = z.object({ ownerId: z.uuid(), documentId: z.uuid() });

/** `document.validate`: the payload holds only ids; the last attempt rejects instead of retrying (ADR 0037). */
export function createValidateDocumentTask(deps: {
  validation: ReturnType<typeof createDocumentValidation>;
}) {
  return async (raw: unknown, helpers: Pick<JobHelpers, "job">): Promise<void> => {
    const { ownerId, documentId } = payload.parse(raw);
    await deps.validation.run(ownerId, documentId, {
      lastAttempt: helpers.job.attempts >= helpers.job.max_attempts,
    });
  };
}
