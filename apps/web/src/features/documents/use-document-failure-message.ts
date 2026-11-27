import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Failure } from "../../lib/api";

/**
 * The message for a failure, chosen by its stable code and never by its text. A lost session goes
 * to the sign-in screen and has no message (`document/screens`).
 */
export function useDocumentFailureMessage() {
  const t = useTranslations("Documents.errors");
  const router = useRouter();
  return (failure: Failure, fileName?: string): string | null => {
    const message = (() => {
      switch (failure.code) {
        case "UNAUTHENTICATED":
          router.push("/login");
          return null;
        case "PARENT_DELETED":
          return t("parentDeleted");
        case "UPLOAD_CONFLICT":
          return t("conflict");
        case "UPLOAD_INCOMPLETE":
          return t("incompleteUpload");
        case "UPLOAD_TOO_LARGE":
          return t("tooLarge");
        case "UPLOAD_PUT_FAILED":
          return t("uploadFailed", { name: fileName ?? "" });
        case "DOCUMENT_TITLE_INVALID":
          return t("titleInvalid");
        case "NOT_FOUND":
          return t("notFound");
        case "RATE_LIMITED":
          return failure.retryAfterSeconds
            ? t("rateLimited", { seconds: failure.retryAfterSeconds })
            : t("rateLimitedNoTime");
        case "NETWORK":
          return t("network");
        default:
          return t("generic");
      }
    })();
    if (message === null) return null;
    const alreadyNamed = failure.code === "UPLOAD_PUT_FAILED";
    return fileName && !alreadyNamed ? t("forFile", { name: fileName, message }) : message;
  };
}
