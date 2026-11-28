"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { resetPassword } from "./auth-client";
import { TextField } from "./text-field";
import { useAccountErrorMessage } from "./use-account-error-message";

/** Chooses the new password with the token of the e-mail link (`user/account-screens`). */
export function ResetPasswordForm({
  token,
  error: linkError,
}: {
  token?: string | undefined;
  error?: string | undefined;
}) {
  const t = useTranslations("Auth");
  const errorMessage = useAccountErrorMessage();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  if (!token || linkError) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t("reset.title")}</h1>
        <p role="alert" className="text-sm text-red-700">
          {t("errors.invalidToken")}
        </p>
        <Link href="/forgot-password" className="text-sm underline">
          {t("reset.askAgain")}
        </Link>
      </section>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    if (password.length < 10 || password.length > 128) return setError(t("errors.passwordLength"));

    sending.current = true;
    setPending(true);
    setError(null);
    const result = await resetPassword({ newPassword: password, token: token! });
    if (result.ok) {
      router.push("/login?reset=1");
      return;
    }
    sending.current = false;
    setPending(false);
    setError(errorMessage(result));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("reset.title")}</h1>
      <TextField
        id="new-password"
        label={t("reset.newPassword")}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint={t("passwordHint")}
      />
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? t("reset.pending") : t("reset.submit")}
      </button>
    </form>
  );
}
