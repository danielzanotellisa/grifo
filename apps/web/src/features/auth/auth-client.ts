export type AuthResult = { ok: true } | { ok: false; code: string; retryAfterSeconds?: number };

/** Calls an authentication route and turns a failure into its stable code (`docs/specs/user`). */
async function post(url: string, body?: unknown): Promise<AuthResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, code: "NETWORK" };
  }
  if (response.ok) return { ok: true };

  const problem = (await response.json().catch(() => ({}))) as { code?: unknown };
  const retryAfter = Number(response.headers.get("retry-after"));
  return {
    ok: false,
    code: typeof problem.code === "string" ? problem.code : "UNKNOWN",
    ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
  };
}

const call = (path: string, body?: unknown) => post(`/api/auth${path}`, body);

export const signUp = (input: { name: string; email: string; password: string }) =>
  call("/sign-up/email", { ...input, callbackURL: "/login?verified=1" });

export const signIn = (input: { email: string; password: string }) => call("/sign-in/email", input);

export const signOut = () => call("/sign-out");

export const requestPasswordReset = (email: string) =>
  call("/request-password-reset", { email, redirectTo: "/reset-password" });

export const resetPassword = (input: { newPassword: string; token: string }) =>
  call("/reset-password", input);

export const sendVerificationEmail = (email: string) =>
  call("/send-verification-email", { email, callbackURL: "/login?verified=1" });

/** Deletes the account of the session after checking the password; answers 204 (`user/lifecycle`). */
export const deleteAccount = (password: string) => post("/api/account/delete", { password });
