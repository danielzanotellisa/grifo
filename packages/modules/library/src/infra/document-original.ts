import { liveOnly, type Tx } from "@app/platform";
import { and, eq } from "drizzle-orm";
import type { RiskFlags } from "../domain/document";
import { documents, storedFiles } from "./schema";

export type DocumentOriginal = { title: string; storageKey: string; riskFlags: RiskFlags };

/** The title, the storage key of the original and the risk flags of a live `READY` document of the owner, or null (`export/annotated-pdf`). */
export async function documentOriginal(
  tx: Tx,
  ownerId: string,
  documentId: string,
): Promise<DocumentOriginal | null> {
  const [row] = await tx
    .select({
      title: documents.title,
      storageKey: storedFiles.storageKey,
      riskFlags: documents.riskFlags,
    })
    .from(documents)
    .innerJoin(storedFiles, eq(storedFiles.id, documents.storedFileId))
    .where(
      and(
        eq(documents.ownerId, ownerId),
        eq(documents.id, documentId),
        eq(documents.status, "READY"),
        liveOnly(documents),
      ),
    );
  return row ?? null;
}
