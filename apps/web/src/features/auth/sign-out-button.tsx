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
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60"
    >
      {t("signOut")}
    </button>
  );
}
