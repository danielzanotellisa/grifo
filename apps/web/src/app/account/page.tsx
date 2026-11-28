import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountView } from "../../features/account/account-view";
import { AppShell } from "../../features/shell/app-shell";
import { currentUser } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser(await headers());
  if (!user) redirect("/login");

  return (
    <AppShell email={user.email}>
      <AccountView email={user.email} />
    </AppShell>
  );
}
