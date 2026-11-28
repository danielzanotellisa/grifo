import type { createExports } from "@app/export";
import type { JobHelpers } from "graphile-worker";
import { z } from "zod";

const payload = z.object({ ownerId: z.uuid(), exportId: z.uuid() });

/** `export.render`: the payload holds only ids; the last attempt fails the export instead of retrying (ADR 0020). */
export function createExportRenderTask(deps: { exports: ReturnType<typeof createExports> }) {
  return async (raw: unknown, helpers: Pick<JobHelpers, "job">): Promise<void> => {
    const { ownerId, exportId } = payload.parse(raw);
    await deps.exports.run(ownerId, exportId, {
      lastAttempt: helpers.job.attempts >= helpers.job.max_attempts,
    });
  };
}
