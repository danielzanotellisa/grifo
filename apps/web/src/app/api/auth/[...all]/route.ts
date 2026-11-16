import { getAuth } from "../../../../composition";
import { toAuthProblem } from "../../../../lib/http/auth-problem";
import { toProblemResponse } from "../../../../lib/http/problem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  try {
    return await toAuthProblem(await getAuth().handler(request), new URL(request.url).pathname);
  } catch (error) {
    return toProblemResponse(error, new URL(request.url).pathname);
  }
}

export { handle as GET, handle as POST };
