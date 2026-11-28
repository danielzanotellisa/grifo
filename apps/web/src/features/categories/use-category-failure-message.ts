import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Failure } from "../../lib/api";

/** The message for a failure, chosen by its stable code; a lost session goes to the sign-in screen (`category/screens`). */
export function useCategoryFailureMessage() {
  const t = useTranslations("Categories.errors");
  const router = useRouter();
  return (failure: Failure): string | null => {
    switch (failure.code) {
      case "UNAUTHENTICATED":
        router.push("/login");
        return null;
      case "CATEGORY_NAME_INVALID":
        return t("nameInvalid");
      case "COLOR_INVALID":
        return t("colorInvalid");
      case "CATEGORY_NAME_TAKEN":
        return t("nameTaken");
      case "CATEGORY_SHORTCUT_TAKEN":
        return t("shortcutTaken");
      case "CATEGORY_INVALID":
        return t("invalid");
      case "CATEGORY_LAST":
        return t("last");
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
