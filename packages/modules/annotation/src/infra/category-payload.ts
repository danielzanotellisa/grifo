import { DomainError, OUTLINE_ROLES } from "@app/platform";
import { z } from "zod";
import { isHexColor } from "../domain/category";

const categoryData = z
  .object({
    id: z.uuid(),
    name: z.string(),
    color: z.string(),
    role: z.enum(OUTLINE_ROLES),
    shortcut: z.number().int().min(1).max(9).nullable(),
    position: z.string().min(1),
  })
  .strict();

const deleteData = z.object({ id: z.uuid(), moveHighlightsTo: z.uuid().optional() });

export type CategoryData = z.infer<typeof categoryData>;
export type CategoryDelete = z.infer<typeof deleteData>;

const invalid = (issues: z.core.$ZodIssue[]) =>
  new DomainError("CATEGORY_INVALID", "The data of the mutation is invalid", 422, {
    issues: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });

export function parseCategoryData(data: unknown): CategoryData {
  const parsed = categoryData.safeParse(data);
  if (!parsed.success) throw invalid(parsed.error.issues);

  const name = parsed.data.name.trim();
  if (name.length < 1 || name.length > 40) {
    throw new DomainError("CATEGORY_NAME_INVALID", "The name must have 1 to 40 characters", 422);
  }
  if (!isHexColor(parsed.data.color)) {
    throw new DomainError("COLOR_INVALID", "The color must be #rrggbb", 422);
  }
  return { ...parsed.data, name };
}

export function parseCategoryDelete(data: unknown): CategoryDelete {
  const parsed = deleteData.safeParse(data);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return parsed.data;
}
