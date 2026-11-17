import { appUrl, db, syncEngine } from "../../../../composition";
import { readJsonBody } from "../../../../lib/http/body";
import { requireUser } from "../../../../lib/http/auth-guard";
import { toProblemResponse } from "../../../../lib/http/problem";
import { assertSameOrigin } from "../../../../lib/http/same-origin";
import { MAX_PUSH_BODY_BYTES, parsePushBody } from "../../../../lib/http/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request, appUrl());
    const { userId } = await requireUser(request);
    const mutations = parsePushBody(await readJsonBody(request, MAX_PUSH_BODY_BYTES));
    return Response.json(await syncEngine.push(db, userId, mutations));
  } catch (error) {
    return toProblemResponse(error, "/api/sync/push");
  }
}
