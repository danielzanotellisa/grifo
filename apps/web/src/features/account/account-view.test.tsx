import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { problem, renderPt } from "../../test/render";
import { AccountView } from "./account-view";

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

const remove = async (
  user: ReturnType<typeof userEvent.setup>,
  password = "senha-bem-forte-123",
) => {
  if (password) await user.type(screen.getByLabelText("Senha atual"), password);
  await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));
};

describe("account page", () => {
  it("[user/account-screens#AC-5] shows the e-mail and what deleting does", () => {
    renderPt(<AccountView email="ana@example.com" />);

    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(screen.getByText(/apagados em 30 dias/)).toBeTruthy();
  });

  it("[user/account-screens#AC-5] deletes with the password and goes to the sign-in screen", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    renderPt(<AccountView email="ana@example.com" />);

    await remove(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(refresh).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/account/delete");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ password: "senha-bem-forte-123" });
  });

  it("[user/account-screens#AC-5] refuses a blank password without sending, and sends once for a double click", async () => {
    let release: () => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>(
          (resolve) => (release = () => resolve(new Response(null, { status: 204 }))),
        ),
    );
    const user = userEvent.setup();
    renderPt(<AccountView email="ana@example.com" />);

    await remove(user, "");
    expect((await screen.findByRole("alert")).textContent).toContain("Informe sua senha.");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Senha atual"), "senha-bem-forte-123");
    await user.dblClick(screen.getByRole("button", { name: "Excluir minha conta" }));
    release();
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["INVALID_CREDENTIALS", () => problem(401, "INVALID_CREDENTIALS"), "Senha incorreta."],
    [
      "RATE_LIMITED",
      () => problem(429, "RATE_LIMITED", { "retry-after": "40" }),
      "Tente de novo em 40 segundos.",
    ],
    ["another failure", () => problem(500, "INTERNAL"), "Algo deu errado. Tente de novo."],
  ])(
    "[user/account-screens#AC-6] shows the message of %s and stays",
    async (_n, answer, message) => {
      fetchMock.mockResolvedValue(answer());
      const user = userEvent.setup();
      renderPt(<AccountView email="ana@example.com" />);

      await remove(user);

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(push).not.toHaveBeenCalled();
      expect(
        (screen.getByRole("button", { name: "Excluir minha conta" }) as HTMLButtonElement).disabled,
      ).toBe(false);
    },
  );

  it("[user/account-screens#AC-6] shows the network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderPt(<AccountView email="ana@example.com" />);

    await remove(user);

    expect((await screen.findByRole("alert")).textContent).toContain("Sem conexão com o servidor.");
  });

  it("[user/account-screens#AC-6] goes to the sign-in screen when the session is gone", async () => {
    fetchMock.mockResolvedValue(problem(401, "UNAUTHENTICATED"));
    const user = userEvent.setup();
    renderPt(<AccountView email="ana@example.com" />);

    await remove(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});
