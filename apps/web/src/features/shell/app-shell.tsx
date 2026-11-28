import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Icon } from "../../components/icons";
import { SignOutButton } from "../auth/sign-out-button";

/** The frame of every page of a signed-in person: the brand, the trash and categories, who they are, the account and sign-out. */
export async function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const t = await getTranslations("Home");
  const [before, after] = t("signedInAs", { email: "\u0000" }).split("\u0000");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center gap-5 px-6 py-3">
          <Link href="/" className="font-serif text-xl font-semibold tracking-tight text-ink-black">
            {t("title")}
          </Link>
          <nav className="flex flex-1 items-center gap-4 whitespace-nowrap text-sm text-ink-muted">
            <Link href="/categories" className="underline-offset-4 hover:text-ink hover:underline">
              {t("categories")}
            </Link>
            <Link href="/trash" className="underline-offset-4 hover:text-ink hover:underline">
              {t("trash")}
            </Link>
          </nav>
          <span className="min-w-0 truncate text-sm text-ink-muted">
            {before}
            <strong className="font-medium text-ink">{email}</strong>
            {after}
          </span>
          <SignOutButton />
          <Link
            href="/account"
            aria-label={t("account")}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-surface hover:bg-ink-black"
          >
            <Icon name="user" size={16} />
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">{children}</main>
      <footer className="border-t border-hairline">
        <p className="mx-auto max-w-3xl px-6 py-3 text-xs font-medium text-ink-muted">
          {t("footer")}
        </p>
      </footer>
    </div>
  );
}
