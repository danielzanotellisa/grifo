import { useTranslations } from "next-intl";
import type { AuthResult } from "./auth-client";
import { useErrorMessage } from "./use-error-message";

/** The messages of the account screens: those of the sign-in screens, plus the invalid link, the network and the wrong password of a deletion. */
export function useAccountErrorMessage(options: { wrongPassword?: boolean } = {}) {
  const t = useTranslations("Auth.errors");
  const account = useTranslations("Account");
  const base = useErrorMessage();
  return (failure: Extract<AuthResult, { ok: false }>): string => {
    if (failure.code === "INVALID_TOKEN") return t("invalidToken");
    if (failure.code === "NETWORK") return t("network");
    if (failure.code === "INVALID_CREDENTIALS" && options.wrongPassword) {
      return account("wrongPassword");
    }
    return base(failure);
  };
}
