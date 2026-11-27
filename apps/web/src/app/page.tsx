import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "../features/auth/sign-out-button";
import { currentUser } from "../lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser(await headers());
  if (!user) redirect("/login");

  const t = await getTranslations("Home");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-3 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-lg text-neutral-600">{t("tagline")}</p>
      <p className="text-sm text-neutral-600">{t("signedInAs", { email: user.email })}</p>
      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
