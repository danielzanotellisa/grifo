"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { deleteAccount } from "../auth/auth-client";
import { bannerError, cardClass } from "../../components/styles";
import { TextField } from "../auth/text-field";
import { useAccountErrorMessage } from "../auth/use-account-error-message";

/** The e-mail of the person and the deletion of the account (`user/account-screens`). */
export function AccountView({ email }: { email: string }) {
  const t = useTranslations("Account");
  const tAuth = useTranslations("Auth");
  const errorMessage = useAccountErrorMessage({ wrongPassword: true });
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    if (password === "") return setError(t("passwordRequired"));

    sending.current = true;
    setPending(true);
    setError(null);
    const result = await deleteAccount(password);
    if (result.ok || result.code === "UNAUTHENTICATED") {
      router.push("/login");
      router.refresh();
      return;
    }
    sending.current = false;
    setPending(false);
    setError(errorMessage(result));
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink-black">
        {t("title")}
      </h1>
      <p>
        {t("email")}: <span className="font-medium">{email}</span>
      </p>

      <form
        onSubmit={onSubmit}
        noValidate
        className={`${cardClass} flex max-w-md flex-col gap-4 border-error/30 p-5`}
      >
        <h2 className="font-serif text-xl font-semibold text-on-error-container">
          {t("deleteTitle")}
        </h2>
        <p className="text-sm text-ink">{t("deleteWarning")}</p>
        <TextField
          id="current-password"
          label={t("currentPassword")}
          type="password"
          revealLabels={{ show: tAuth("showPassword"), hide: tAuth("hidePassword") }}
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        {error ? (
          <p role="alert" className={bannerError}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center self-start rounded-md bg-error px-4 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60"
        >
          {t("delete")}
        </button>
      </form>
    </section>
  );
}
