import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { problem, renderPt } from "../../test/render";
import { SignUpForm } from "./sign-up-form";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const PASSWORD = "senha-bem-forte-123";
const fill = async (user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) => {
  for (const [label, value] of Object.entries(values)) {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    if (value) await user.type(field, value);
  }
};
const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Criar conta" }));

describe("sign-up form", () => {
  it("[user/screens#AC-1] sends the trimmed fields and shows the confirmation instead of the form", async () => {
    fetchMock.mockResolvedValue(Response.json({ token: null }));
    const user = userEvent.setup();
    renderPt(<SignUpForm />);

    await fill(user, { Nome: "  Ana Souza ", "E-mail": "  ana@example.com ", Senha: PASSWORD });
    await submit(user);

    await screen.findByText(/ana@example\.com/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/sign-up/email");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "Ana Souza",
      email: "ana@example.com",
      password: PASSWORD,
      callbackURL: "/login?verified=1",
    });
    expect(screen.queryByLabelText("Senha")).toBeNull();
  });

  it.each([
    [
      "a blank name",
      { Nome: "  ", "E-mail": "a@b.co", Senha: PASSWORD },
      "Nome",
      "Informe seu nome.",
    ],
    [
      "a blank email",
      { Nome: "Ana", "E-mail": " ", Senha: PASSWORD },
      "E-mail",
      "Informe seu e-mail.",
    ],
    [
      "a password of 9 characters",
      { Nome: "Ana", "E-mail": "a@b.co", Senha: "123456789" },
      "Senha",
      "A senha precisa ter de 10 a 128 caracteres.",
    ],
    [
      "a password of 129 characters",
      { Nome: "Ana", "E-mail": "a@b.co", Senha: "x".repeat(129) },
      "Senha",
      "A senha precisa ter de 10 a 128 caracteres.",
    ],
  ])(
    "[user/screens#AC-2] refuses %s, focuses the field and sends nothing",
    async (_name, values, field, message) => {
      const user = userEvent.setup();
      renderPt(<SignUpForm />);

      await fill(user, values);
      await submit(user);

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(document.activeElement).toBe(screen.getByLabelText(field));
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "PASSWORD_INVALID",
      problem(400, "PASSWORD_INVALID"),
      "A senha precisa ter de 10 a 128 caracteres.",
    ],
    [
      "RATE_LIMITED",
      problem(429, "RATE_LIMITED", { "retry-after": "42" }),
      "Muitas tentativas. Tente de novo em 42 segundos.",
    ],
    ["an unexpected error", problem(500, "INTERNAL"), "Algo deu errado. Tente de novo."],
  ])(
    "[user/screens#AC-3] shows the message of %s and keeps what was typed",
    async (_name, answer, message) => {
      fetchMock.mockResolvedValue(answer);
      const user = userEvent.setup();
      renderPt(<SignUpForm />);

      await fill(user, { Nome: "Ana", "E-mail": "ana@example.com", Senha: PASSWORD });
      await submit(user);

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Ana");
      expect((screen.getByLabelText("E-mail") as HTMLInputElement).value).toBe("ana@example.com");
      expect((screen.getByLabelText("Senha") as HTMLInputElement).value).toBe(PASSWORD);
    },
  );

  it("[user/screens#AC-3] shows the generic message when the network fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderPt(<SignUpForm />);

    await fill(user, { Nome: "Ana", "E-mail": "ana@example.com", Senha: PASSWORD });
    await submit(user);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Algo deu errado. Tente de novo.",
    );
  });

  it("[user/screens#AC-9] disables the button while pending and sends once, and labels every field", async () => {
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderPt(<SignUpForm />);

    expect(screen.getByLabelText("Nome").getAttribute("autocomplete")).toBe("name");
    expect(screen.getByLabelText("E-mail").getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("Senha").getAttribute("autocomplete")).toBe("new-password");
    await fill(user, { Nome: "Ana", "E-mail": "ana@example.com", Senha: PASSWORD });
    await user.type(screen.getByLabelText("Senha"), "{Enter}");
    await user.keyboard("{Enter}");
    const button = screen.getByRole("button", { name: /Criando/ }) as HTMLButtonElement;
    await user.click(button);
    fireEvent.submit(button.closest("form")!);

    expect(button.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(Response.json({}));
    await waitFor(() => expect(screen.queryByLabelText("Senha")).toBeNull());
  });
});
