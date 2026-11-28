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

describe("sign-in form: password reset and confirmation e-mail", () => {
  it("[user/account-screens#AC-3] links to the password request and says the password was changed", () => {
    renderPt(<SignInForm verified={false} reset />);

    expect(screen.getByText("Senha alterada. Entre com a nova senha.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Esqueci minha senha" }).getAttribute("href")).toBe(
      "/forgot-password",
    );
  });

  it("[user/account-screens#AC-3] shows no changed-password banner otherwise", () => {
    renderPt(<SignInForm verified={false} />);

    expect(screen.queryByText("Senha alterada. Entre com a nova senha.")).toBeNull();
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toBeTruthy();
  });

  it("[user/account-screens#AC-4] offers to resend the confirmation e-mail after EMAIL_NOT_VERIFIED and sends it", async () => {
    fetchMock.mockResolvedValueOnce(problem(403, "EMAIL_NOT_VERIFIED"));
    fetchMock.mockResolvedValueOnce(Response.json({ status: true }));
    const user = userEvent.setup();
    renderPt(<SignInForm verified={false} />);

    await signIn(user);
    await user.click(await screen.findByRole("button", { name: "Reenviar e-mail de confirmação" }));

    expect((await screen.findByRole("status")).textContent).toContain(
      "Enviamos um novo link para ana@example.com.",
    );
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/api/auth/send-verification-email");
    expect(JSON.parse(init.body)).toEqual({
      email: "ana@example.com",
      callbackURL: "/login?verified=1",
    });
  });

  it("[user/account-screens#AC-4] does not offer the resend for other errors", async () => {
    fetchMock.mockResolvedValue(problem(401, "INVALID_CREDENTIALS"));
    const user = userEvent.setup();
    renderPt(<SignInForm verified={false} />);

    await signIn(user);
    await screen.findByRole("alert");

    expect(screen.queryByRole("button", { name: "Reenviar e-mail de confirmação" })).toBeNull();
  });
});

describe("sign-in form: showing the password", () => {
  it("[user/screens#AC-10] shows and hides the typed password without sending the form", async () => {
    const user = userEvent.setup();
    renderPt(<SignInForm verified={false} />);
    const field = screen.getByLabelText("Senha") as HTMLInputElement;
    await user.type(field, "senha-bem-forte-123");

    expect(field.type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Mostrar caracteres" }));
    expect(field.type).toBe("text");
    expect(field.value).toBe("senha-bem-forte-123");
    await user.click(screen.getByRole("button", { name: "Ocultar caracteres" }));
    expect(field.type).toBe("password");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
