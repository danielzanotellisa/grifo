"use client";

import Link from "next/link";
import { bannerError, bannerSuccess, buttonPrimary } from "../../components/styles";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { requestPasswordReset } from "./auth-client";
import { TextField } from "./text-field";
import { useAccountErrorMessage } from "./use-account-error-message";

/** Asks for the e-mail that gets the reset link; the answer is the same for any address (`user/account-screens`). */
export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const errorMessage = useAccountErrorMessage();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const address = email.trim();
    if (address === "") return setError(t("errors.emailRequired"));

    sending.current = true;
    setPending(true);
    setError(null);
    const result = await requestPasswordReset(address);
    sending.current = false;
    setPending(false);
    if (result.ok) setSent(address);
    else setError(errorMessage(result));
  }

  if (sent !== null) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink-black">
          {t("forgot.title")}
        </h1>
        <p role="status" className={bannerSuccess}>
          {t("forgot.sent", { email: sent })}
        </p>
        <Link href="/login" className="text-sm font-medium text-ink underline underline-offset-4">
          {t("forgot.backToSignIn")}
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink-black">
        {t("forgot.title")}
      </h1>
      <p className="text-sm text-ink-muted">{t("forgot.intro")}</p>
      <TextField
        id="email"
        label={t("fields.email")}
        type="email"
        icon="mail"
        autoComplete="email"
        value={email}
        onChange={setEmail}
      />
      {error ? (
        <p role="alert" className={bannerError}>
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? t("forgot.pending") : t("forgot.submit")}
      </button>
      <Link href="/login" className="text-sm font-medium text-ink underline underline-offset-4">
        {t("forgot.backToSignIn")}
      </Link>
    </form>
  );
}
