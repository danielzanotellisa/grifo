"use client";

import Link from "next/link";
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
      <h1 className="text-2xl font-semibold">{t("signIn.title")}</h1>
      {verified ? (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {t("signIn.verified")}
        </p>
      ) : null}
      {reset ? (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {t("signIn.passwordChanged")}
        </p>
      ) : null}
      {resent ? (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {t("signIn.resent", { email: resent })}
        </p>
      ) : null}
      <TextField
        id="email"
        label={t("fields.email")}
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(email) => setValues((v) => ({ ...v, email }))}
      />
      <TextField
        id="password"
        label={t("fields.password")}
        type="password"
        autoComplete="current-password"
        value={values.password}
        onChange={(password) => setValues((v) => ({ ...v, password }))}
        inputRef={passwordRef}
      />
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {unverified ? (
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={pending}
          className="self-start text-sm underline disabled:opacity-60"
        >
          {t("signIn.resend")}
        </button>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? t("signIn.pending") : t("signIn.submit")}
      </button>
      <Link href="/forgot-password" className="text-sm underline">
        {t("signIn.forgot")}
      </Link>
      <p className="text-sm text-neutral-600">
        {t("signIn.noAccount")}{" "}
        <Link href="/signup" className="underline">
          {t("signIn.toSignUp")}
        </Link>
      </p>
    </form>
  );
}
