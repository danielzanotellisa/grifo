import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "../features/shell/app-shell";
import { SubjectsView } from "../features/subjects/subjects-view";
import { currentUser } from "../lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser(await headers());
  if (!user) redirect("/login");

  return (
    <AppShell email={user.email}>
      <SubjectsView />
    </AppShell>
  );
}
