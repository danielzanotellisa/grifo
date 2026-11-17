import { appUrl, getUploads } from "../../../../../composition";
import { requireUser } from "../../../../../lib/http/auth-guard";
import { documentIdFrom } from "../../../../../lib/http/document-id";
import { toProblemResponse } from "../../../../../lib/http/problem";
import { assertSameOrigin } from "../../../../../lib/http/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    assertSameOrigin(request, appUrl());
    const { userId } = await requireUser(request);
    return Response.json(await getUploads().confirm(userId, documentIdFrom(id)), { status: 202 });
  } catch (error) {
    return toProblemResponse(error, `/api/documents/${id}/confirm`);
  }
}
