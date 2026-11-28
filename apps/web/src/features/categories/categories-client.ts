import { generateKeyBetween } from "fractional-indexing";
import { v7 as uuidv7 } from "uuid";
import { pullAll, pushMutations, type Pulled, type Result } from "../../lib/api";
import type { Category } from "../reader/highlights-client";

export type CategoryRole = "TOPIC" | "DEFINITION" | "ITEM" | "IGNORE";
export type CategoryDraft = {
  name: string;
  color: string;
  role: CategoryRole;
  shortcut: number | null;
};

/** The live categories by position (`category/screens`). */
export function extractCategories(pulled: Pulled[]): Category[] {
  return pulled
    .filter((c) => c.entity === "category" && c.op === "upsert")
    .map((c) => c.data as Category)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

export async function loadCategories(): Promise<Result<Category[]>> {
  const pulled = await pullAll();
  return pulled.ok ? { ok: true, value: extractCategories(pulled.value) } : pulled;
}

const save = (category: Category): Promise<Result<null>> =>
  pushMutations([{ entity: "category", op: "upsert", data: { ...category } }]);

/** A new category goes after the last one; its id is made here, a UUIDv7 (ADR 0006). */
export const createCategory = (draft: CategoryDraft, categories: Category[]) =>
  save({
    id: uuidv7(),
    ...draft,
    name: draft.name.trim(),
    position: generateKeyBetween(categories.at(-1)?.position ?? null, null),
  });

export const editCategory = (category: Category, draft: CategoryDraft) =>
  save({ ...category, ...draft, name: draft.name.trim() });

/** Moves a category one place: its new position is between the two categories it ends up between. */
export function moveCategory(categories: Category[], id: string, direction: -1 | 1) {
  const index = categories.findIndex((c) => c.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= categories.length) return null;
  const before = direction === -1 ? categories[target - 1] : categories[target];
  const after = direction === -1 ? categories[target] : categories[target + 1];
  return save({
    ...categories[index]!,
    position: generateKeyBetween(before?.position ?? null, after?.position ?? null),
  });
}

export const removeCategory = (id: string, moveHighlightsTo?: string) =>
  pushMutations([
    {
      entity: "category",
      op: "delete",
      data: moveHighlightsTo ? { id, moveHighlightsTo } : { id },
    },
  ]);
