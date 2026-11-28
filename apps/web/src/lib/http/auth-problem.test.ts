import { describe, expect, it } from "vitest";
import { toAuthProblem } from "./auth-problem";

const libraryAnswer = (status: number, code: string) =>
  new Response(JSON.stringify({ code, message: "x" }), { status });

describe("toAuthProblem", () => {
  it("[user/lifecycle#AC-1] answers a sign-in to a deleted account like a wrong password", async () => {
    const problem = await toAuthProblem(
      libraryAnswer(401, "FAILED_TO_CREATE_SESSION"),
      "/api/auth/sign-in/email",
    );

    expect(problem.status).toBe(401);
    expect(await problem.json()).toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("[user/lifecycle#AC-1] keeps the stable code of a wrong password", async () => {
    const problem = await toAuthProblem(
      libraryAnswer(401, "INVALID_EMAIL_OR_PASSWORD"),
      "/api/auth/sign-in/email",
    );

    expect(await problem.json()).toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});
