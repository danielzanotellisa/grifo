import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { problem, renderPt } from "../../test/render";
import { ExportButton } from "./export-button";

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

const show = (
  scope: "DOCUMENT" | "SUBJECT" = "DOCUMENT",
  label = "Exportar para Anki",
  kind: "FLASHCARDS_APKG" | "SUMMARY_PDF" = "FLASHCARDS_APKG",
) => {
  renderPt(
    <ExportButton
      kind={kind}
      scope={scope}
      scopeId="s1"
      label={label}
      pollMs={5}
      onDownload={download}
    />,
  );
  return userEvent.setup();
};

describe("export button", () => {
  it.each([
    ["FLASHCARDS_APKG", "DOCUMENT", "Exportar para Anki"],
    ["FLASHCARDS_APKG", "SUBJECT", "Exportar flashcards (Anki)"],
    ["SUMMARY_PDF", "DOCUMENT", "Exportar resumo (PDF)"],
    ["SUMMARY_PDF", "SUBJECT", "Exportar resumos (PDF)"],
  ] as const)(
    "[export/apkg#AC-8] [export/summary-pdf#AC-6] requests the %s export of a %s, waits for it and downloads the file",
    async (kind, scope, label) => {
      api.exportAnswers = [
        { status: "QUEUED", error: null },
        { status: "RUNNING", error: null },
        { status: "SUCCEEDED", error: null, downloadUrl: "http://storage.test/get/deck.apkg" },
      ];
      const user = show(scope, label, kind);

      await user.click(screen.getByRole("button", { name: label }));

      await waitFor(() =>
        expect(download).toHaveBeenCalledWith("http://storage.test/get/deck.apkg"),
      );
      expect(api.exportRequests).toEqual([{ kind, scope, scopeId: "s1" }]);
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
