import type { OutlineRole } from "@app/platform";

export type Category = {
  id: string;
  ownerId: string;
  name: string;
  color: string; // #rrggbb
  role: OutlineRole;
  shortcut: number | null; // 1-9 keyboard shortcut
  position: string; // fractional index for ordering in the palette
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export const isHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

/**
 * Seeded once per new account. `nameKey` is an i18n key: the stored name is the translation
 * at seed time, after which it is plain user data the user can rename.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ nameKey: string; color: string; role: OutlineRole; shortcut: number }> = [
  { nameKey: "category.default.topic", color: "#4F8EF7", role: "TOPIC", shortcut: 1 },
  { nameKey: "category.default.definition", color: "#F7D04F", role: "DEFINITION", shortcut: 2 },
  { nameKey: "category.default.example", color: "#5BC17F", role: "ITEM", shortcut: 3 },
  { nameKey: "category.default.important", color: "#F06A6A", role: "ITEM", shortcut: 4 },
];
