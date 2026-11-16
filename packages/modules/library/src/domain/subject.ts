export type Subject = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};
