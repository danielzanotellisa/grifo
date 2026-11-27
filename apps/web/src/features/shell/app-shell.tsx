import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SignOutButton } from "../auth/sign-out-button";

/** The frame of every page of a signed-in person: the brand, the trash, who they are and sign-out. */
export async function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const t = await getTranslations("Home");
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center gap-4 border-b border-neutral-200 pb-4">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          {t("title")}
        </Link>
        <nav className="flex-1">
          <Link href="/trash" className="text-sm text-neutral-600 underline">
            {t("trash")}
          </Link>
        </nav>
        <span className="text-sm text-neutral-600">{t("signedInAs", { email })}</span>
        <SignOutButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
