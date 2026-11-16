import { DomainError } from "@app/platform";
import { z } from "zod";

const subjectData = z.object({ id: z.uuid(), name: z.string() }).strict();
const documentData = z.object({ id: z.uuid(), subjectId: z.uuid(), title: z.string() }).strict();
const idData = z.object({ id: z.uuid() });

const invalid = (code: string, issues: z.core.$ZodIssue[]) =>
  new DomainError(code, "The data of the mutation is invalid", 422, {
    issues: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });

const trimmed = (value: string, max: number, code: string, what: string): string => {
  const text = value.trim();
  if (text.length < 1 || text.length > max) {
    throw new DomainError(code, `The ${what} must have 1 to ${max} characters`, 422);
  }
  return text;
};

export function parseSubjectData(data: unknown): { id: string; name: string } {
  const parsed = subjectData.safeParse(data);
  if (!parsed.success) throw invalid("SUBJECT_INVALID", parsed.error.issues);
  return {
    id: parsed.data.id,
    name: trimmed(parsed.data.name, 120, "SUBJECT_NAME_INVALID", "name"),
  };
}

export function parseDocumentData(data: unknown): { id: string; subjectId: string; title: string } {
  const parsed = documentData.safeParse(data);
  if (!parsed.success) throw invalid("DOCUMENT_INVALID", parsed.error.issues);
  const { id, subjectId, title } = parsed.data;
  return { id, subjectId, title: trimmed(title, 200, "DOCUMENT_TITLE_INVALID", "title") };
}

/** A delete mutation only needs the id; anything else the client sends is ignored. */
export function parseIdData(data: unknown, code: string): { id: string } {
  const parsed = idData.safeParse(data);
  if (!parsed.success) throw invalid(code, parsed.error.issues);
  return parsed.data;
}
