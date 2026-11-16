export const EXPORT_KINDS = [
  "SUMMARY_PDF",
  "ANNOTATED_PDF",
  "FLASHCARDS_APKG",
  "FULL_DATA",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const EXPORT_SCOPES = ["DOCUMENT", "SUBJECT", "ACCOUNT"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export type Export = {
  id: string;
  ownerId: string;
  kind: ExportKind;
  scope: ExportScope;
  scopeId: string | null; // null only for ACCOUNT
  status: ExportStatus;
  templateId: string | null; // SUMMARY_PDF only
  templateVersion: number | null;
  snapshotCursor: number; // sync cursor at request time
  resultKey: string | null; // key in the derived bucket
  error: { code: string; message: string } | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const ALLOWED: Record<ExportStatus, readonly ExportStatus[]> = {
  QUEUED: ["RUNNING"],
  RUNNING: ["SUCCEEDED", "FAILED", "QUEUED"], // back to QUEUED on retry
  SUCCEEDED: [],
  FAILED: ["QUEUED"], // manual "try again"
};

export const canTransitionExport = (from: ExportStatus, to: ExportStatus): boolean =>
  ALLOWED[from].includes(to);
