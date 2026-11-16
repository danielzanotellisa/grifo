/** Capabilities are named by what they allow, never by plan (ADR 0019). */
export type BooleanCapability =
  "export.summaryPdf" | "export.flashcardsCsv" | "export.annotatedPdf";
export type LimitCapability = "upload.maxFileSizeBytes" | "storage.maxBytes";

export interface EntitlementPolicy {
  can(userId: string, capability: BooleanCapability): Promise<boolean>;
  /** null = unlimited (product-wise). Technical safety ceilings live in config, not here. */
  limit(userId: string, capability: LimitCapability): Promise<number | null>;
}

export const allowAll: EntitlementPolicy = {
  can: async () => true,
  limit: async () => null,
};
