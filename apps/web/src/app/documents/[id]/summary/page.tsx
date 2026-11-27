import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "../../../../features/shell/app-shell";
import { OutlineView } from "../../../../features/outline/outline-view";
import { currentUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(await headers());
  if (!user) redirect("/login");

  const { id } = await params;
  return (
    <AppShell email={user.email}>
      <OutlineView documentId={id} />
    </AppShell>
  );
}
