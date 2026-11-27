import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Failure } from "./subjects-client";

/**
 * The message for a failure, chosen by its stable code and never by its text. A lost session goes to
 * the sign-in screen and has no message (`subject/screens`).
 */
export function useFailureMessage(scope: "subjects" | "trash" = "subjects") {
  const t = useTranslations("Subjects.errors");
  const router = useRouter();
  return (failure: Failure): string | null => {
    switch (failure.code) {
      case "UNAUTHENTICATED":
        router.push("/login");
        return null;
      case "SUBJECT_NAME_INVALID":
      case "SUBJECT_INVALID":
        return t("nameInvalid");
      case "NOT_FOUND":
        return scope === "trash" ? t("trashNotFound") : t("notFound");
      case "PARENT_DELETED":
        return t("parentDeleted");
      case "RATE_LIMITED":
        return failure.retryAfterSeconds
          ? t("rateLimited", { seconds: failure.retryAfterSeconds })
          : t("rateLimitedNoTime");
      case "NETWORK":
        return t("network");
      default:
        return t("generic");
    }
  };
}
