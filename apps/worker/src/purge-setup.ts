import { annotationPurgeParticipant } from "@app/annotation";
import { createExportPurgeParticipant } from "@app/export";
import { accountPurge } from "@app/identity";
import { createLibraryPurgeParticipant } from "@app/library";
import { outlinePurgeParticipant } from "@app/outline";
import { createPurge, platformPurgeParticipant, type ObjectStorage } from "@app/platform";
import { studyPurgeParticipant } from "@app/study";

/** Every module that has something to purge, then the accounts whose window is over (`user/purge`). */
export const buildPurge = (storage: ObjectStorage) =>
  createPurge(
    [
      createLibraryPurgeParticipant({ storage }),
      annotationPurgeParticipant,
      outlinePurgeParticipant,
      studyPurgeParticipant,
      createExportPurgeParticipant({ storage }),
      platformPurgeParticipant,
    ],
    accountPurge,
  );
