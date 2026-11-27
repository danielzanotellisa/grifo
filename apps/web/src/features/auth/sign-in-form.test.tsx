import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { problem, renderPt } from "../../test/render";
import { SignInForm } from "./sign-in-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const signIn = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
  await user.type(screen.getByLabelText("Senha"), "senha-bem-forte-123");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
};

describe("sign-in form", () => {
  it("[user/screens#AC-4] sends the credentials and goes to the home on success", async () => {
    fetchMock.mockResolvedValue(Response.json({ token: "x" }));
    const user = userEvent.setup();
    renderPt(<SignInForm verified={false} />);

    await signIn(user);

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/sign-in/email");
    expect(JSON.parse(init.body)).toEqual({
      email: "ana@example.com",
      password: "senha-bem-forte-123",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    ["INVALID_CREDENTIALS", problem(401, "INVALID_CREDENTIALS"), "E-mail ou senha incorretos."],
    [
      "EMAIL_NOT_VERIFIED",
      problem(403, "EMAIL_NOT_VERIFIED"),
      "Confirme seu e-mail antes de entrar.",
    ],
    [
      "RATE_LIMITED",
      problem(429, "RATE_LIMITED", { "retry-after": "30" }),
      "Muitas tentativas. Tente de novo em 30 segundos.",
    ],
    ["an unexpected error", problem(500, "INTERNAL"), "Algo deu errado. Tente de novo."],
  ])(
    "[user/screens#AC-5] shows the message of %s, keeps the email and clears the password",
    async (_name, answer, message) => {
      fetchMock.mockResolvedValue(answer);
      const user = userEvent.setup();
      renderPt(<SignInForm verified={false} />);

      await signIn(user);

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect((screen.getByLabelText("E-mail") as HTMLInputElement).value).toBe("ana@example.com");
      expect((screen.getByLabelText("Senha") as HTMLInputElement).value).toBe("");
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("[user/screens#AC-6] says the email was confirmed only when told so", () => {
    const { unmount } = renderPt(<SignInForm verified />);
    expect(screen.getByRole("status").textContent).toContain("E-mail confirmado");
    unmount();

    renderPt(<SignInForm verified={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("[user/screens#AC-9] disables the button while pending and sends once, and labels every field", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderPt(<SignInForm verified={false} />);

    expect(screen.getByLabelText("E-mail").getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("Senha").getAttribute("autocomplete")).toBe("current-password");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-bem-forte-123{Enter}");
    await user.keyboard("{Enter}");

    fireEvent.submit(screen.getByRole("button", { name: /Entrando/ }).closest("form")!);
    const button = screen.getByRole("button", { name: /Entrando/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
