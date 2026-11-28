import { appUrl, getExports } from "../../../composition";
import { readJsonBody } from "../../../lib/http/body";
import { requireUser } from "../../../lib/http/auth-guard";
import { parseExportRequest } from "../../../lib/http/schemas";
import { toProblemResponse } from "../../../lib/http/problem";
import { assertSameOrigin } from "../../../lib/http/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request, appUrl());
    const { userId } = await requireUser(request);
    const input = parseExportRequest(await readJsonBody(request, MAX_BODY_BYTES));
    const created = await getExports().request(userId, input);
    return Response.json(created, { status: 202 });
  } catch (error) {
    return toProblemResponse(error, "/api/exports");
  }
}
