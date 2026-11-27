import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ReaderPage } from "../../../features/reader/reader-page";
import { currentUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(await headers());
  if (!user) redirect("/login");

  const { id } = await params;
  return <ReaderPage documentId={id} />;
}
