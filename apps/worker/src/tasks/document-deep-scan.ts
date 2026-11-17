import type { createDeepScan } from "@app/library";
import type { JobHelpers } from "graphile-worker";
import { z } from "zod";

const payload = z.object({ ownerId: z.uuid(), documentId: z.uuid() });

/** `document.deepScan`: the payload holds only ids; the last attempt gives up quietly (ADR 0038). */
export function createDeepScanTask(deps: { scan: ReturnType<typeof createDeepScan> }) {
  return async (raw: unknown, helpers: Pick<JobHelpers, "job">): Promise<void> => {
    const { ownerId, documentId } = payload.parse(raw);
    await deps.scan.run(ownerId, documentId, {
      lastAttempt: helpers.job.attempts >= helpers.job.max_attempts,
    });
  };
}
