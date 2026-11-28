import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cardClass } from "../../components/styles";

/** The page of the sign-in and sign-up screens: the brand over a card (ADR 0043). */
export function AuthFrame({ children }: { children: ReactNode }) {
  const t = useTranslations("Auth.brand");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="text-center">
        <p className="font-serif text-3xl font-semibold tracking-wide text-ink-black">
          {t("name")}
        </p>
        <p className="mt-2 font-serif text-base italic text-ink-muted">{t("tagline")}</p>
      </header>
      <div className={`${cardClass} p-8`}>{children}</div>
    </main>
  );
}
