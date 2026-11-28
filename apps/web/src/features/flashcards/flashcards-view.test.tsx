import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { problem, renderPt } from "../../test/render";
import { FlashcardsView } from "./flashcards-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const card = (
  id: string,
  front: string,
  back: string,
  documentId = "d1",
  sourceNodeId: string | null = "n1",
) => ({
  id,
  documentId,
  sourceNodeId,
  front,
  back,
});
let api: FakeApi;
beforeEach(() => {
  api = new FakeApi();
  api.subjects = [{ id: "s1", name: "Redes" }];
  api.documents = [
    { id: "d1", subjectId: "s1", title: "Aula 1", status: "READY", pageCount: 3 },
    { id: "d2", subjectId: "s1", title: "Aula 2", status: "READY", pageCount: 3 },
  ];
  api.categories = [
    {
      id: "c2",
      name: "Definição",
      color: "#F7D04F",
      role: "DEFINITION",
      shortcut: 2,
      position: "a1",
    },
  ];
  api.highlights = [
    {
      id: "h1",
      documentId: "d1",
      categoryId: "c2",
      pageIndex: 0,
      rects: [{ x1: 1, y1: 1, x2: 2, y2: 2 }],
      quote: { exact: "Roteador encaminha pacotes", prefix: "", suffix: "" },
      note: null,
    },
  ];
  api.nodes = [
    {
      id: "n1",
      documentId: "d1",
      parentId: null,
      position: "a0",
      highlightId: "h1",
      role: null,
      text: null,
    },
  ];
  push.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});

const open = async (id = "d1") => {
  renderPt(<FlashcardsView documentId={id} />);
  await screen.findByRole("list", { name: "Flashcards" });
};
const cards = () =>
  screen.queryByRole("list", { name: "Flashcards" })
    ? within(screen.getByRole("list", { name: "Flashcards" })).getAllByRole("listitem")
    : [];
const fronts = () => cards().map((c) => c.querySelector("[data-front]")?.textContent);

describe("flashcards page: the list", () => {
  it("[flashcard/screens#AC-3] lists only the live cards of this document by front, with front and back", async () => {
    api.flashcards = [
      card("f1", "Roteador", "Encaminha pacotes"),
      card("f2", "Ponte", "Liga redes"),
      card("f3", "De outro documento", "x", "d2"),
    ];
    await open();

    expect(fronts()).toEqual(["Ponte", "Roteador"]);
    expect(cards()[0]!.textContent).toContain("Liga redes");
    expect(cards()[1]!.textContent).toContain("Encaminha pacotes");
    expect(screen.queryByText("De outro documento")).toBeNull();
  });

  it("[flashcard/screens#AC-3] says there are no cards, and links to the summary", async () => {
    renderPt(<FlashcardsView documentId="d1" />);

    expect(await screen.findByText(/Este documento ainda não tem flashcards/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para o resumo" }).getAttribute("href")).toBe(
      "/documents/d1/summary",
    );
  });

  it("[flashcard/screens#AC-3] says the document was not found", async () => {
    renderPt(<FlashcardsView documentId="nao-existe" />);

    expect(await screen.findByText("Documento não encontrado.")).toBeTruthy();
  });

  it("[flashcard/screens#AC-3] explains a document that is not ready", async () => {
    api.documents = [{ id: "d1", subjectId: "s1", title: "Aula 1", status: "VALIDATING" }];
    renderPt(<FlashcardsView documentId="d1" />);

    expect(await screen.findByText("Este documento ainda está sendo preparado.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Flashcards" })).toBeNull();
  });
});

describe("flashcards page: editing, updating and deleting", () => {
  beforeEach(() => {
    api.flashcards = [card("f1", "Roteador", "Texto antigo")];
  });

  it("[flashcard/screens#AC-4] edits front and back with one upsert of both trimmed", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Editar Roteador" }));
    const front = screen.getByLabelText("Frente do flashcard");
    const back = screen.getByLabelText("Verso do flashcard");
    await user.clear(front);
    await user.type(front, "  Roteador (L3)  ");
    await user.clear(back);
    await user.type(back, "  Encaminha pacotes entre redes  ");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(fronts()).toEqual(["Roteador (L3)"]));
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]![0]).toMatchObject({
      entity: "flashcard",
      op: "upsert",
      data: { id: "f1", front: "Roteador (L3)", back: "Encaminha pacotes entre redes" },
    });
    expect(cards()[0]!.textContent).toContain("Encaminha pacotes entre redes");
  });

  it.each([
    ["front", "Frente do flashcard", "Informe a frente do flashcard."],
    ["back", "Verso do flashcard", "O verso do flashcard está vazio."],
  ])(
    "[flashcard/screens#AC-4] refuses a blank %s without sending, and Escape cancels",
    async (_n, label, message) => {
      const user = userEvent.setup();
      await open();

      await user.click(screen.getByRole("button", { name: "Editar Roteador" }));
      await user.clear(screen.getByLabelText(label));
      await user.type(screen.getByLabelText(label), "   ");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(api.batches).toEqual([]);
      fireEvent.keyDown(screen.getByLabelText(label), { key: "Escape" });
      expect(screen.queryByLabelText("Frente do flashcard")).toBeNull();
      expect(api.batches).toEqual([]);
    },
  );

  it("[flashcard/screens#AC-5] updates the back from the summary with one upsert", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Atualizar pelo resumo: Roteador" }));

    await waitFor(() => expect(cards()[0]!.textContent).toContain("Roteador encaminha pacotes"));
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]![0]).toMatchObject({
      entity: "flashcard",
      op: "upsert",
      data: { id: "f1", refreshFromSource: true },
    });
  });

  it("[flashcard/screens#AC-5] says the node is gone when the source is gone", async () => {
    api.nodes = [];
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Atualizar pelo resumo: Roteador" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "O item do resumo desse flashcard foi apagado.",
    );
    expect(cards()[0]!.textContent).toContain("Texto antigo");
  });

  it("[flashcard/screens#AC-6] deletes with one delete and says it went to the trash", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Apagar Roteador" }));

    await waitFor(() => expect(cards()).toHaveLength(0));
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]![0]).toMatchObject({
      entity: "flashcard",
      op: "delete",
      data: { id: "f1" },
    });
    expect(screen.getByRole("status").textContent).toContain("“Roteador” foi para a lixeira.");
  });

  it.each([
    [
      "FLASHCARD_FRONT_REQUIRED",
      () => api.rejectNext("FLASHCARD_FRONT_REQUIRED"),
      "Informe a frente do flashcard.",
    ],
    [
      "FLASHCARD_BACK_EMPTY",
      () => api.rejectNext("FLASHCARD_BACK_EMPTY"),
      "O verso do flashcard está vazio.",
    ],
    [
      "NOT_FOUND",
      () => api.rejectNext("NOT_FOUND"),
      "Esse flashcard não existe mais. Atualizamos a lista.",
    ],
    [
      "RATE_LIMITED",
      () => api.fail("/api/sync/push", problem(429, "RATE_LIMITED", { "retry-after": "5" })),
      "Muitas tentativas. Tente de novo em 5 segundos.",
    ],
    [
      "a network failure",
      () => api.fail("/api/sync/push", "network"),
      "Sem conexão com o servidor.",
    ],
  ])(
    "[flashcard/screens#AC-7] shows the message of %s and keeps the cards as the server has them",
    async (_n, fail, message) => {
      const user = userEvent.setup();
      await open();
      fail();

      await user.click(screen.getByRole("button", { name: "Apagar Roteador" }));

      expect(await screen.findByText((text) => text.includes(message))).toBeTruthy();
      expect(fronts()).toEqual(["Roteador"]);
    },
  );

  it("[flashcard/screens#AC-7] goes to the sign-in screen when the session is gone", async () => {
    const user = userEvent.setup();
    await open();
    api.fail("/api/sync/push", problem(401, "UNAUTHENTICATED"));

    await user.click(screen.getByRole("button", { name: "Apagar Roteador" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});

describe("flashcards page: the export", () => {
  beforeEach(() => {
    api.flashcards = [card("f1", "Roteador", "Texto")];
  });

  it("[export/apkg#AC-8] exports the deck of this document", async () => {
    api.exportAnswers = [{ status: "RUNNING", error: null }]; // the page does not navigate in jsdom
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Exportar para Anki" }));

    await waitFor(() =>
      expect(api.exportRequests).toEqual([
        { kind: "FLASHCARDS_APKG", scope: "DOCUMENT", scopeId: "d1" },
      ]),
    );
  });

  it("[export/apkg#AC-8] offers no export for a document that is not ready", async () => {
    api.documents = [{ id: "d1", subjectId: "s1", title: "Aula 1", status: "VALIDATING" }];
    renderPt(<FlashcardsView documentId="d1" />);
    await screen.findByText("Este documento ainda está sendo preparado.");

    expect(screen.queryByRole("button", { name: "Exportar para Anki" })).toBeNull();
  });
});
