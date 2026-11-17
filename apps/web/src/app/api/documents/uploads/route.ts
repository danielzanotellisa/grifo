import { appUrl, getUploads } from "../../../../composition";
import { readJsonBody } from "../../../../lib/http/body";
import { requireUser } from "../../../../lib/http/auth-guard";
import { toProblemResponse } from "../../../../lib/http/problem";
import { assertSameOrigin } from "../../../../lib/http/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request, appUrl());
    const { userId } = await requireUser(request);
    const ticket = await getUploads().start(userId, await readJsonBody(request, MAX_BODY_BYTES));
    return Response.json(ticket, { status: 201 });
  } catch (error) {
    return toProblemResponse(error, "/api/documents/uploads");
  }
}
