import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SubjectDocumentsView } from "../../../features/documents/subject-documents-view";
import { AppShell } from "../../../features/shell/app-shell";
import { currentUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(await headers());
  if (!user) redirect("/login");

  const { id } = await params;
  return (
    <AppShell email={user.email}>
      <SubjectDocumentsView subjectId={id} />
    </AppShell>
  );
}
