import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { problem, renderPt } from "../../test/render";
import { ResetPasswordForm } from "./reset-password-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const submit = async (user: ReturnType<typeof userEvent.setup>, password: string) => {
  await user.type(screen.getByLabelText("Nova senha"), password);
  await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
};

describe("reset password form", () => {
  it("[user/account-screens#AC-2] sends the token and the password, then goes to the sign-in screen", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: true }));
    const user = userEvent.setup();
    renderPt(<ResetPasswordForm token="tok-123" />);

    await submit(user, "outra-senha-forte-456");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login?reset=1"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/reset-password");
    expect(JSON.parse(init.body)).toEqual({
      newPassword: "outra-senha-forte-456",
      token: "tok-123",
    });
  });

  it.each([
    ["short", "curta"],
    ["long", "x".repeat(129)],
  ])("[user/account-screens#AC-2] refuses a %s password without sending", async (_n, password) => {
    const user = userEvent.setup();
    renderPt(<ResetPasswordForm token="tok-123" />);

    await submit(user, password);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "A senha precisa ter de 10 a 128 caracteres.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing token", undefined, undefined],
    ["an error in the link", "tok-123", "INVALID_TOKEN"],
  ])("[user/account-screens#AC-2] says the link is invalid for %s", (_n, token, error) => {
    renderPt(<ResetPasswordForm token={token} error={error} />);

    expect(screen.getByText("Este link é inválido ou expirou.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pedir um novo link" }).getAttribute("href")).toBe(
      "/forgot-password",
    );
    expect(screen.queryByLabelText("Nova senha")).toBeNull();
  });

  it.each([
    ["INVALID_TOKEN", () => problem(400, "INVALID_TOKEN"), "Este link é inválido ou expirou."],
    [
      "PASSWORD_INVALID",
      () => problem(400, "PASSWORD_INVALID"),
      "A senha precisa ter de 10 a 128 caracteres.",
    ],
    [
      "RATE_LIMITED",
      () => problem(429, "RATE_LIMITED", { "retry-after": "9" }),
      "Tente de novo em 9 segundos.",
    ],
    ["another failure", () => problem(500, "INTERNAL"), "Algo deu errado. Tente de novo."],
  ])("[user/account-screens#AC-2] shows the message of %s", async (_n, answer, message) => {
    fetchMock.mockResolvedValue(answer());
    const user = userEvent.setup();
    renderPt(<ResetPasswordForm token="tok-123" />);

    await submit(user, "outra-senha-forte-456");

    expect(await screen.findByText((text) => text.includes(message))).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
