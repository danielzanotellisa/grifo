import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CategoriesView } from "../../features/categories/categories-view";
import { AppShell } from "../../features/shell/app-shell";
import { currentUser } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const user = await currentUser(await headers());
  if (!user) redirect("/login");

  return (
    <AppShell email={user.email}>
      <CategoriesView />
    </AppShell>
  );
}
