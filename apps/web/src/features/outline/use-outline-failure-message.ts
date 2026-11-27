import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Failure } from "../../lib/api";

/** The message for a failure, chosen by its stable code; a lost session goes to the sign-in screen (`outline-node/screens`). */
export function useOutlineFailureMessage() {
  const t = useTranslations("Outline.errors");
  const router = useRouter();
  return (failure: Failure): string | null => {
    switch (failure.code) {
      case "UNAUTHENTICATED":
        router.push("/login");
        return null;
      case "OUTLINE_CYCLE":
        return t("cycle");
      case "OUTLINE_NODE_INVALID":
        return t("invalid");
      case "PARENT_DELETED":
        return t("parentDeleted");
      case "NOT_FOUND":
      case "OUTLINE_NODE_NOT_FOUND":
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
