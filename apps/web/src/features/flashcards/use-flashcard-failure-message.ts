import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Failure } from "../../lib/api";

/** The message for a failure, chosen by its stable code; a lost session goes to the sign-in screen (`flashcard/screens`). */
export function useFlashcardFailureMessage() {
  const t = useTranslations("Flashcards.errors");
  const router = useRouter();
  return (failure: Failure): string | null => {
    switch (failure.code) {
      case "UNAUTHENTICATED":
        router.push("/login");
        return null;
      case "FLASHCARD_REQUIRES_DEFINITION":
        return t("requiresDefinition");
      case "FLASHCARD_FRONT_REQUIRED":
        return t("frontRequired");
      case "FLASHCARD_BACK_EMPTY":
        return t("backEmpty");
      case "FLASHCARD_INVALID":
        return t("invalid");
      case "FLASHCARD_SOURCE_GONE":
        return t("sourceGone");
      case "PARENT_DELETED":
        return t("parentDeleted");
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
  };
}
