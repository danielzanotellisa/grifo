import { getUploads } from "../../../../../composition";
import { requireUser } from "../../../../../lib/http/auth-guard";
import { documentIdFrom } from "../../../../../lib/http/document-id";
import { toProblemResponse } from "../../../../../lib/http/problem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const { userId } = await requireUser(request);
    return Response.json(await getUploads().open(userId, documentIdFrom(id)));
  } catch (error) {
    return toProblemResponse(error, `/api/documents/${id}/file`);
  }
}
