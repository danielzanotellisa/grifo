import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "../../features/shell/app-shell";
import { TrashView } from "../../features/subjects/trash-view";
import { currentUser } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const user = await currentUser(await headers());
  if (!user) redirect("/login");

  return (
    <AppShell email={user.email}>
      <TrashView />
    </AppShell>
  );
}
