import { useTranslations } from "next-intl";
import type { AuthResult } from "./auth-client";

/** The message for a failed answer, chosen by its stable code and never by its text (spec `user/screens`). */
export function useErrorMessage() {
  const t = useTranslations("Auth.errors");
  return (failure: Extract<AuthResult, { ok: false }>): string => {
    switch (failure.code) {
      case "INVALID_CREDENTIALS":
        return t("invalidCredentials");
      case "EMAIL_NOT_VERIFIED":
        return t("emailNotVerified");
      case "PASSWORD_INVALID":
        return t("passwordLength");
      case "RATE_LIMITED":
        return failure.retryAfterSeconds
          ? t("rateLimited", { seconds: failure.retryAfterSeconds })
          : t("rateLimitedNoTime");
      default:
        return t("generic");
    }
  };
}
