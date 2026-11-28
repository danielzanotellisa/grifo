"use client";

import Link from "next/link";
import { bannerError, bannerSuccess, buttonPrimary } from "../../components/styles";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { sendVerificationEmail, signIn } from "./auth-client";
import { TextField } from "./text-field";
import { useAccountErrorMessage } from "./use-account-error-message";
import { useErrorMessage } from "./use-error-message";

export function SignInForm({ verified, reset = false }: { verified: boolean; reset?: boolean }) {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const resendErrorMessage = useAccountErrorMessage();
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState<string | null>(null);
  const sending = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;

    sending.current = true;
    setPending(true);
    setError(null);
    setUnverified(false);
    setResent(null);
    const result = await signIn({ email: values.email.trim(), password: values.password });
    if (result.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    sending.current = false;
    setPending(false);
    setError(errorMessage(result));
    setUnverified(result.code === "EMAIL_NOT_VERIFIED");
    setValues((v) => ({ ...v, password: "" }));
    passwordRef.current?.focus();
  }

  async function onResend() {
    if (sending.current) return;
    const address = values.email.trim();
    sending.current = true;
    setPending(true);
    const result = await sendVerificationEmail(address);
    sending.current = false;
    setPending(false);
    if (result.ok) {
      setResent(address);
      setError(null);
      setUnverified(false);
    } else setError(resendErrorMessage(result));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink-black">
        {t("signIn.title")}
      </h1>
      {verified ? (
        <p role="status" className={bannerSuccess}>
          {t("signIn.verified")}
        </p>
      ) : null}
      {reset ? (
        <p role="status" className={bannerSuccess}>
          {t("signIn.passwordChanged")}
        </p>
      ) : null}
      {resent ? (
        <p role="status" className={bannerSuccess}>
          {t("signIn.resent", { email: resent })}
        </p>
      ) : null}
      <TextField
        id="email"
        label={t("fields.email")}
        type="email"
        icon="mail"
        autoComplete="email"
        value={values.email}
        onChange={(email) => setValues((v) => ({ ...v, email }))}
      />
      <TextField
        id="password"
        label={t("fields.password")}
        type="password"
        icon="lock"
        revealLabels={{ show: t("showPassword"), hide: t("hidePassword") }}
        labelAction={
          <Link
            href="/forgot-password"
            className="text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {t("signIn.forgot")}
          </Link>
        }
        autoComplete="current-password"
        value={values.password}
        onChange={(password) => setValues((v) => ({ ...v, password }))}
        inputRef={passwordRef}
      />
      {error ? (
        <p role="alert" className={bannerError}>
          {error}
        </p>
      ) : null}
      {unverified ? (
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={pending}
          className="self-start text-sm font-medium text-ink underline underline-offset-4 disabled:opacity-60"
        >
          {t("signIn.resend")}
        </button>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? t("signIn.pending") : t("signIn.submit")}
      </button>
      <p className="text-center text-sm text-ink-muted">
        {t("signIn.noAccount")}{" "}
        <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
          {t("signIn.toSignUp")}
        </Link>
      </p>
    </form>
  );
}
