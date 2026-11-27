"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { signUp } from "./auth-client";
import { TextField } from "./text-field";
import { useErrorMessage } from "./use-error-message";

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

type FieldName = "name" | "email" | "password";

export function SignUpForm() {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [fieldError, setFieldError] = useState<{ field: FieldName; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const sending = useRef(false);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  const set = (field: FieldName) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;

    const name = values.name.trim();
    const email = values.email.trim();
    const invalid: { field: FieldName; message: string } | null = !name
      ? { field: "name", message: t("errors.nameRequired") }
      : !email
        ? { field: "email", message: t("errors.emailRequired") }
        : values.password.length < PASSWORD_MIN || values.password.length > PASSWORD_MAX
          ? { field: "password", message: t("errors.passwordLength") }
          : null;
    setFormError(null);
    setFieldError(invalid);
    if (invalid) {
      refs[invalid.field].current?.focus();
      return;
    }

    sending.current = true;
    setPending(true);
    const result = await signUp({ name, email, password: values.password });
    sending.current = false;
    setPending(false);
    if (result.ok) setSentTo(email);
    else setFormError(errorMessage(result));
  }

  if (sentTo) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">{t("signUp.confirmationTitle")}</h1>
        <p role="status">{t("signUp.confirmationBody", { email: sentTo })}</p>
        <Link href="/login" className="underline">
          {t("signUp.toSignIn")}
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("signUp.title")}</h1>
      <TextField
        id="name"
        label={t("fields.name")}
        autoComplete="name"
        value={values.name}
        onChange={set("name")}
        error={fieldError?.field === "name" ? fieldError.message : undefined}
        inputRef={refs.name}
      />
      <TextField
        id="email"
        label={t("fields.email")}
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={set("email")}
        error={fieldError?.field === "email" ? fieldError.message : undefined}
        inputRef={refs.email}
      />
      <TextField
        id="password"
        label={t("fields.password")}
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={set("password")}
        hint={t("passwordHint")}
        error={fieldError?.field === "password" ? fieldError.message : undefined}
        inputRef={refs.password}
      />
      {formError ? (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? t("signUp.pending") : t("signUp.submit")}
      </button>
      <p className="text-sm text-neutral-600">
        {t("signUp.hasAccount")}{" "}
        <Link href="/login" className="underline">
          {t("signUp.toSignIn")}
        </Link>
      </p>
    </form>
  );
}
