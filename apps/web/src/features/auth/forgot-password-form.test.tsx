import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { problem, renderPt } from "../../test/render";
import { ForgotPasswordForm } from "./forgot-password-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("forgot password form", () => {
  it("[user/account-screens#AC-1] requests the link with the trimmed e-mail and the redirect, then confirms", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: true }));
    const user = userEvent.setup();
    renderPt(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("E-mail"), "  ana@example.com  ");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect((await screen.findByRole("status")).textContent).toContain(
      "Se existir uma conta com ana@example.com, enviamos um link para criar uma nova senha.",
    );
    expect(screen.queryByLabelText("E-mail")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/request-password-reset");
    expect(JSON.parse(init.body)).toEqual({
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
  });

  it("[user/account-screens#AC-1] sends nothing for a blank e-mail", async () => {
    const user = userEvent.setup();
    renderPt(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("E-mail"), "   ");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Informe seu e-mail.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a rate limit",
      () => problem(429, "RATE_LIMITED", { "retry-after": "20" }),
      "Tente de novo em 20 segundos.",
    ],
    ["an unexpected error", () => problem(500, "INTERNAL"), "Algo deu errado. Tente de novo."],
  ])(
    "[user/account-screens#AC-1] shows the message of %s and keeps the form",
    async (_n, answer, message) => {
      fetchMock.mockResolvedValue(answer());
      const user = userEvent.setup();
      renderPt(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
      await user.click(screen.getByRole("button", { name: "Enviar link" }));

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect((screen.getByLabelText("E-mail") as HTMLInputElement).value).toBe("ana@example.com");
    },
  );

  it("[user/account-screens#AC-1] shows the network failure and keeps the form", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderPt(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Sem conexão com o servidor.");
  });
});
