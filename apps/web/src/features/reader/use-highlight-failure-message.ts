import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Failure } from "../../lib/api";

/** The message for a failure, chosen by its stable code; a lost session goes to the sign-in screen (`highlight/screens`). */
export function useHighlightFailureMessage() {
  const t = useTranslations("Highlights.errors");
  const router = useRouter();
  return (failure: Failure): string | null => {
    switch (failure.code) {
      case "UNAUTHENTICATED":
        router.push("/login");
        return null;
      case "HIGHLIGHT_EMPTY":
        return t("empty");
      case "HIGHLIGHT_INVALID":
        return t("invalid");
      case "DOCUMENT_NOT_READY":
        return t("notReady");
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
