export const DOCUMENT_STATUSES = ["UPLOADED", "VALIDATING", "READY", "REJECTED", "QUARANTINED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Counts of risky PDF keys found by the deep scan (ADR 0017). Informational: they do not block. */
export type RiskFlags = Partial<Record<"javascript" | "openAction" | "additionalActions" | "launch" | "embeddedFiles" | "xfa", number>>;

export type Document = {
  id: string;
  ownerId: string;
  subjectId: string;
  storedFileId: string;
  title: string;
  status: DocumentStatus;
  pageCount: number | null;
  riskFlags: RiskFlags;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const ALLOWED: Record<DocumentStatus, readonly DocumentStatus[]> = {
  UPLOADED: ["VALIDATING"],
  VALIDATING: ["READY", "REJECTED"],
  READY: ["QUARANTINED"],
  REJECTED: [],
  QUARANTINED: [],
};

export const canTransition = (from: DocumentStatus, to: DocumentStatus): boolean => ALLOWED[from].includes(to);
