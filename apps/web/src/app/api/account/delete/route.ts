import { deleteAccount } from "@app/identity";
import { appUrl, authDb, getAuth } from "../../../../composition";
import { requireUser } from "../../../../lib/http/auth-guard";
import { toProblemResponse } from "../../../../lib/http/problem";
import { assertSameOrigin } from "../../../../lib/http/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readPassword = async (request: Request): Promise<string> => {
  const body: unknown = await request.json().catch(() => null);
  const password =
    typeof body === "object" && body !== null
      ? (body as { password?: unknown }).password
      : undefined;
  return typeof password === "string" ? password : "";
};

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request, appUrl());
    await requireUser(request);
    await deleteAccount({
      db: authDb,
      auth: getAuth(),
      headers: request.headers,
      password: await readPassword(request),
    });
    const cleared = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
    const headers = new Headers();
    for (const cookie of cleared.headers.getSetCookie()) headers.append("set-cookie", cookie);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return toProblemResponse(error, "/api/account/delete");
  }
}
