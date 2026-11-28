"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { deleteAccount } from "../auth/auth-client";
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
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p>
        {t("email")}: <span className="font-medium">{email}</span>
      </p>

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex max-w-md flex-col gap-4 rounded-md border border-red-200 p-4"
      >
        <h2 className="text-lg font-semibold text-red-800">{t("deleteTitle")}</h2>
        <p className="text-sm text-neutral-700">{t("deleteWarning")}</p>
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
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {t("delete")}
        </button>
      </form>
    </section>
  );
}
