import { notFound } from "@app/platform";
import { appUrl, db, trash } from "../../../../../composition";
import { requireUser } from "../../../../../lib/http/auth-guard";
import { toProblemResponse } from "../../../../../lib/http/problem";
import { assertSameOrigin } from "../../../../../lib/http/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    assertSameOrigin(request, appUrl());
    const { userId } = await requireUser(request);
    if (!UUID.test(id)) throw notFound("trash item");
    await trash.restore(db, userId, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toProblemResponse(error, `/api/trash/${id}/restore`);
  }
}
