"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { signIn } from "./auth-client";
import { TextField } from "./text-field";
import { useErrorMessage } from "./use-error-message";

export function SignInForm({ verified }: { verified: boolean }) {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;

    sending.current = true;
    setPending(true);
    setError(null);
    const result = await signIn({ email: values.email.trim(), password: values.password });
    if (result.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    sending.current = false;
    setPending(false);
    setError(errorMessage(result));
    setValues((v) => ({ ...v, password: "" }));
    passwordRef.current?.focus();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("signIn.title")}</h1>
      {verified ? (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {t("signIn.verified")}
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
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? t("signIn.pending") : t("signIn.submit")}
      </button>
      <p className="text-sm text-neutral-600">
        {t("signIn.noAccount")}{" "}
        <Link href="/signup" className="underline">
          {t("signIn.toSignUp")}
        </Link>
      </p>
    </form>
  );
}
