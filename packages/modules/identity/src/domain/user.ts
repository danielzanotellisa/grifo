export type User = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
