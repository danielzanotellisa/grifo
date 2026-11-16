export type StoredFile = {
  id: string;
  ownerId: string;
  sha256: string; // lowercase hex, 64 chars
  sizeBytes: number;
  storageKey: string; // see originalKey() in @app/platform
  createdAt: Date;
};

export const isSha256Hex = (value: string): boolean => /^[0-9a-f]{64}$/.test(value);
