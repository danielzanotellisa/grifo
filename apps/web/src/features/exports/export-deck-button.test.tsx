import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { problem, renderPt } from "../../test/render";
import { ExportDeckButton } from "./export-deck-button";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

let api: FakeApi;
const download = vi.fn();
beforeEach(() => {
  api = new FakeApi();
  push.mockReset();
  download.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});

const show = (scope: "DOCUMENT" | "SUBJECT" = "DOCUMENT", label = "Exportar para Anki") => {
  renderPt(
    <ExportDeckButton scope={scope} scopeId="s1" label={label} pollMs={5} onDownload={download} />,
  );
  return userEvent.setup();
};

describe("export deck button", () => {
  it.each([
    ["DOCUMENT", "Exportar para Anki"],
    ["SUBJECT", "Exportar flashcards (Anki)"],
  ] as const)(
    "[export/apkg#AC-8] requests the %s deck, waits for it and downloads the file",
    async (scope, label) => {
      api.exportAnswers = [
        { status: "QUEUED", error: null },
        { status: "RUNNING", error: null },
        { status: "SUCCEEDED", error: null, downloadUrl: "http://storage.test/get/deck.apkg" },
      ];
      const user = show(scope, label);

      await user.click(screen.getByRole("button", { name: label }));

      await waitFor(() =>
        expect(download).toHaveBeenCalledWith("http://storage.test/get/deck.apkg"),
      );
      expect(api.exportRequests).toEqual([{ kind: "FLASHCARDS_APKG", scope, scopeId: "s1" }]);
      expect(api.exportPolls).toBe(3);
      expect(download).toHaveBeenCalledTimes(1);
      expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(
        false,
      );
    },
  );

  it("[export/apkg#AC-8] is disabled and says it is generating while waiting, and sends one request", async () => {
    api.exportAnswers = [{ status: "RUNNING", error: null }];
    const user = show();

    await user.click(screen.getByRole("button", { name: "Exportar para Anki" }));
    await user.click(screen.getByRole("button", { name: /Gerando/ }));

    expect((await screen.findByRole("status")).textContent).toContain("Gerando o arquivo");
    expect((screen.getByRole("button", { name: /Gerando/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(api.exportRequests).toHaveLength(1);
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a failed export",
      () =>
        (api.exportAnswers = [
          { status: "FAILED", error: { code: "EXPORT_FAILED", message: "x" } },
        ]),
      "Não foi possível gerar o arquivo. Tente de novo.",
    ],
    [
      "NOT_FOUND",
      () => api.fail("/api/exports", problem(404, "NOT_FOUND")),
      "Esse item não existe mais.",
    ],
    [
      "RATE_LIMITED",
      () => api.fail("/api/exports", problem(429, "RATE_LIMITED", { "retry-after": "7" })),
      "Muitas tentativas. Tente de novo em 7 segundos.",
    ],
    ["a network failure", () => api.fail("/api/exports", "network"), "Sem conexão com o servidor."],
    [
      "a poll that fails",
      () => api.fail("/api/exports/e1", problem(500, "INTERNAL")),
      "Algo deu errado. Tente de novo.",
    ],
  ])(
    "[export/apkg#AC-8] shows the message of %s and lets the user try again",
    async (_n, arrange, message) => {
      arrange();
      const user = show();

      await user.click(screen.getByRole("button", { name: "Exportar para Anki" }));

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(download).not.toHaveBeenCalled();
      expect(
        (screen.getByRole("button", { name: "Exportar para Anki" }) as HTMLButtonElement).disabled,
      ).toBe(false);
    },
  );

  it("[export/apkg#AC-8] goes to the sign-in screen when the session is gone", async () => {
    api.fail("/api/exports", problem(401, "UNAUTHENTICATED"));
    const user = show();

    await user.click(screen.getByRole("button", { name: "Exportar para Anki" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});
