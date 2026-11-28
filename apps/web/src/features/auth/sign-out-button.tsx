"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { signOut } from "./auth-client";

export function SignOutButton() {
  const t = useTranslations("Home");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  async function onClick() {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="shrink-0 text-sm font-medium text-ink underline-offset-4 hover:underline disabled:opacity-60"
    >
      {t("signOut")}
    </button>
  );
}
