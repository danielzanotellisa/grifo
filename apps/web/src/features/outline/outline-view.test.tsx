import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { problem, renderPt } from "../../test/render";
import { OutlineView } from "./outline-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const free = (id: string, parentId: string | null, position: string, text = id, role = "ITEM") => ({
  id,
  documentId: "d1",
  parentId,
  position,
  highlightId: null,
  role,
  text,
});
const categories = [
  { id: "c1", name: "Tópico", color: "#4F8EF7", role: "TOPIC", shortcut: 1, position: "a0" },
  {
    id: "c2",
    name: "Definição",
    color: "#F7D04F",
    role: "DEFINITION",
    shortcut: 2,
    position: "a1",
  },
  { id: "c3", name: "Exemplo", color: "#5BC17F", role: "ITEM", shortcut: 3, position: "a2" },
];
const highlight = (id: string, categoryId: string, exact: string) => ({
  id,
  documentId: "d1",
  categoryId,
  pageIndex: 0,
  rects: [{ x1: 1, y1: 1, x2: 2, y2: 2 }],
  quote: { exact, prefix: "", suffix: "" },
  note: null,
});

let api: FakeApi;
beforeEach(() => {
  api = new FakeApi();
  api.subjects = [{ id: "s1", name: "Redes" }];
  api.documents = [
    { id: "d1", subjectId: "s1", title: "Aula 1", status: "READY", pageCount: 3 },
    { id: "d2", subjectId: "s1", title: "Aula 2", status: "READY", pageCount: 3 },
  ];
  api.categories = categories;
  push.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});

const open = async (id = "d1") => {
  renderPt(<OutlineView documentId={id} />);
  await screen.findByRole("tree");
};
const tree = () => screen.getByRole("tree");
const rows = () => within(tree()).getAllByRole("treeitem");
const ids = () => rows().map((r) => r.getAttribute("data-node-id"));
const select = async (user: ReturnType<typeof userEvent.setup>, id: string) =>
  user.click(rows().find((r) => r.getAttribute("data-node-id") === id)!);
const key = (k: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(tree(), { key: k, ...init });

describe("summary: what the page shows", () => {
  it("[outline-node/screens#AC-1] shows the live nodes of this document as a tree with text, role, level and color", async () => {
    api.highlights = [
      highlight("h1", "c1", "Camada de rede"),
      highlight("h2", "c2", "Roteador: dispositivo que encaminha pacotes"),
      highlight("h3", "c3", "Exemplo de RIP"),
    ];
    api.nodes = [
      { ...free("n1", null, "a0"), highlightId: "h1", role: null, text: null },
      { ...free("n2", "n1", "a0"), highlightId: "h2", role: null, text: null },
      { ...free("n4", "n1", "a1"), highlightId: "h3", role: "TOPIC", text: "Texto trocado" },
      free("n3", null, "a1", "Anotação livre", "ITEM"),
      free("n5", "ghost", "a2", "Sem pai", "ITEM"),
      { ...free("n6", null, "a3", "De outro documento"), documentId: "d2" },
    ];
    await open();

    expect(ids()).toEqual(["n1", "n2", "n4", "n3", "n5"]);
    const byId = (id: string) => rows().find((r) => r.getAttribute("data-node-id") === id)!;
    expect(byId("n1").textContent).toContain("Camada de rede");
    expect(byId("n1").getAttribute("aria-level")).toBe("1");
    expect(within(byId("n1")).getByRole("heading").getAttribute("aria-level")).toBe("1");
    expect(byId("n2").textContent).toContain("Roteador: dispositivo que encaminha pacotes");
    expect(byId("n2").getAttribute("aria-level")).toBe("2");
    expect(within(byId("n2")).getByText("Definição")).toBeTruthy();
    expect(byId("n4").textContent).toContain("Texto trocado");
    expect(within(byId("n4")).getByRole("heading").getAttribute("aria-level")).toBe("2");
    expect(byId("n3").textContent).toContain("Anotação livre");
    expect(byId("n5").getAttribute("aria-level")).toBe("1");
    expect(screen.queryByText("De outro documento")).toBeNull();
    expect(byId("n1").querySelector("[data-color]")?.getAttribute("data-color")).toBe("#4F8EF7");
    expect(byId("n3").querySelector("[data-color]")).toBeNull();
  });

  it("[outline-node/screens#AC-1] says the summary is empty", async () => {
    renderPt(<OutlineView documentId="d1" />);

    expect(await screen.findByText(/O resumo deste documento está vazio/)).toBeTruthy();
  });

  it.each([["missing", "nao-existe", "Documento não encontrado."]])(
    "[outline-node/screens#AC-1] says the document is %s",
    async (_n, id, message) => {
      renderPt(<OutlineView documentId={id} />);

      expect(await screen.findByText(message)).toBeTruthy();
    },
  );

  it("[outline-node/screens#AC-1] does not show the summary of a document that is not ready", async () => {
    api.documents = [{ id: "d1", subjectId: "s1", title: "Aula 1", status: "VALIDATING" }];
    renderPt(<OutlineView documentId="d1" />);

    expect(await screen.findByText("Este documento ainda está sendo preparado.")).toBeTruthy();
    expect(screen.queryByRole("tree")).toBeNull();
  });
});

describe("summary: keys", () => {
  beforeEach(() => {
    api.nodes = [free("A", null, "a0"), free("B", null, "a1"), free("C", null, "a2")];
  });

  it("[outline-node/screens#AC-2] indents with Tab: one upsert, B under A after its last child, C stays at the root", async () => {
    const user = userEvent.setup();
    await open();
    await select(user, "B");

    key("Tab");

    await waitFor(() =>
      expect(
        rows()
          .find((r) => r.getAttribute("data-node-id") === "B")!
          .getAttribute("aria-level"),
      ).toBe("2"),
    );
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]).toHaveLength(1);
    expect(api.batches[0]![0]).toMatchObject({
      entity: "outlineNode",
      op: "upsert",
      data: {
        id: "B",
        documentId: "d1",
        parentId: "A",
        highlightId: null,
        role: "ITEM",
        text: "B",
      },
    });
    expect(ids()).toEqual(["A", "B", "C"]);
  });

  it("[outline-node/screens#AC-2] sends nothing when there is no previous sibling", async () => {
    const user = userEvent.setup();
    await open();
    await select(user, "A");

    key("Tab");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(api.batches).toEqual([]);
  });

  it("[outline-node/screens#AC-3] outdents with Shift+Tab: B between A and D, and sends nothing for a root node", async () => {
    api.nodes = [
      free("A", null, "a0"),
      free("B", "A", "a0"),
      free("C", "A", "a1"),
      free("D", null, "a1"),
    ];
    const user = userEvent.setup();
    await open();
    await select(user, "B");

    key("Tab", { shiftKey: true });

    await waitFor(() => expect(api.batches).toHaveLength(1));
    const data = api.batches[0]![0]!.data;
    expect(data).toMatchObject({ id: "B", parentId: null });
    expect(String(data.position) > "a0" && String(data.position) < "a1").toBe(true);
    await waitFor(() =>
      expect(ids()).toEqual(["A", "C", "B", "D"].filter((id) => id !== "C" || true)),
    );
    expect(ids()).toEqual(["A", "C", "B", "D"]);

    await select(user, "A");
    key("Tab", { shiftKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.batches).toHaveLength(1);
  });

  it("[outline-node/screens#AC-4] moves among siblings with Alt+Arrow, and sends nothing at the ends", async () => {
    const user = userEvent.setup();
    await open();
    await select(user, "C");

    key("ArrowUp", { altKey: true });

    await waitFor(() => expect(ids()).toEqual(["A", "C", "B"]));
    expect(api.batches).toHaveLength(1);
    const position = String(api.batches[0]![0]!.data.position);
    expect(position > "a0" && position < "a1").toBe(true);

    key("ArrowDown", { altKey: true });
    await waitFor(() => expect(ids()).toEqual(["A", "B", "C"]));
    await select(user, "A");
    key("ArrowUp", { altKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.batches).toHaveLength(2);
  });

  it("[outline-node/screens#AC-1] selects with the arrow keys, and the selection is announced", async () => {
    const user = userEvent.setup();
    await open();
    await select(user, "A");

    key("ArrowDown");
    key("ArrowDown");

    expect(
      rows()
        .filter((r) => r.getAttribute("aria-selected") === "true")
        .map((r) => r.getAttribute("data-node-id")),
    ).toEqual(["C"]);
    key("ArrowDown");
    key("ArrowUp");
    expect(
      rows()
        .find((r) => r.getAttribute("aria-selected") === "true")!
        .getAttribute("data-node-id"),
    ).toBe("B");
  });

  it("[outline-node/screens#AC-5] deletes with Delete: one delete and the children take its place", async () => {
    api.nodes = [
      free("A", null, "a0"),
      free("B", "A", "a0"),
      free("C", "A", "a1"),
      free("D", null, "a1"),
    ];
    const user = userEvent.setup();
    await open();
    await select(user, "A");

    key("Delete");

    await waitFor(() => expect(ids()).toEqual(["B", "C", "D"]));
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]).toEqual([
      expect.objectContaining({ entity: "outlineNode", op: "delete", data: { id: "A" } }),
    ]);
    expect(rows().every((r) => r.getAttribute("aria-level") === "1")).toBe(true);
  });
});

describe("summary: free text and editing", () => {
  beforeEach(() => {
    api.highlights = [highlight("h1", "c1", "Camada de rede")];
    api.nodes = [
      free("A", null, "a0"),
      { ...free("H", null, "a1"), highlightId: "h1", role: null, text: null },
    ];
  });

  it("[outline-node/screens#AC-6] adds free text after the selected node with a new UUIDv7 and the trimmed text", async () => {
    const user = userEvent.setup();
    await open();
    await select(user, "A");

    await user.selectOptions(screen.getByLabelText("Papel do novo nó"), "DEFINITION");
    await user.type(screen.getByLabelText("Texto do novo nó"), "  Nova nota  ");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(rows()).toHaveLength(3));
    const data = api.batches[0]![0]!.data;
    expect(data).toMatchObject({
      documentId: "d1",
      parentId: null,
      highlightId: null,
      role: "DEFINITION",
      text: "Nova nota",
    });
    expect(String(data.id)).toMatch(UUID_V7);
    expect(ids()[1]).toBe(data.id);
    expect((screen.getByLabelText("Texto do novo nó") as HTMLInputElement).value).toBe("");
  });

  it("[outline-node/screens#AC-6] adds last at the root when nothing is selected, and refuses a blank text", async () => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText("Texto do novo nó"), "   ");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Informe o texto do nó.");
    expect(api.batches).toEqual([]);

    await user.type(screen.getByLabelText("Texto do novo nó"), "Fim");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(ids().at(-1)).toBe(api.batches[0]![0]!.data.id);
  });

  it("[outline-node/screens#AC-7] overrides the text and role of a highlight node and keeps its highlight", async () => {
    const user = userEvent.setup();
    await open();
    await select(user, "H");

    key("Enter");
    const text = screen.getByLabelText("Texto do nó") as HTMLInputElement;
    expect(text.value).toBe("Camada de rede");
    await user.clear(text);
    await user.type(text, "Meu título");
    await user.selectOptions(screen.getByLabelText("Papel do nó"), "TOPIC");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByLabelText("Texto do nó")).toBeNull());
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]![0]!.data).toMatchObject({
      id: "H",
      highlightId: "h1",
      text: "Meu título",
      role: "TOPIC",
    });
    expect(screen.getByText("Meu título")).toBeTruthy();
  });

  it("[outline-node/screens#AC-7] sends text null for an empty text and role null for the same role as the highlight", async () => {
    api.nodes = [{ ...free("H", null, "a1"), highlightId: "h1", role: "ITEM", text: "Trocado" }];
    const user = userEvent.setup();
    await open();
    await select(user, "H");

    key("Enter");
    await user.clear(screen.getByLabelText("Texto do nó"));
    await user.selectOptions(screen.getByLabelText("Papel do nó"), "");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(api.batches).toHaveLength(1));
    expect(api.batches[0]![0]!.data).toMatchObject({
      id: "H",
      highlightId: "h1",
      text: null,
      role: null,
    });
  });

  it("[outline-node/screens#AC-7] cancels with Escape, and refuses a free-text node without text", async () => {
    const user = userEvent.setup();
    await open();
    await select(user, "H");

    key("Enter");
    await user.type(screen.getByLabelText("Texto do nó"), " mudou");
    fireEvent.keyDown(screen.getByLabelText("Texto do nó"), { key: "Escape" });
    expect(screen.queryByLabelText("Texto do nó")).toBeNull();
    expect(api.batches).toEqual([]);

    await select(user, "A");
    key("Enter");
    await user.clear(screen.getByLabelText("Texto do nó"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Informe o texto do nó.");
    expect(api.batches).toEqual([]);
  });
});

describe("summary: failures", () => {
  beforeEach(() => {
    api.nodes = [free("A", null, "a0"), free("B", null, "a1")];
  });

  it.each([
    [
      "OUTLINE_CYCLE",
      () => api.rejectNext("OUTLINE_CYCLE"),
      "Esse movimento criaria um ciclo no resumo.",
    ],
    [
      "OUTLINE_NODE_INVALID",
      () => api.rejectNext("OUTLINE_NODE_INVALID"),
      "Esse item do resumo não é válido.",
    ],
    [
      "PARENT_DELETED",
      () => api.rejectNext("PARENT_DELETED"),
      "O documento ou o item pai não existe mais.",
    ],
    [
      "NOT_FOUND",
      () => api.rejectNext("NOT_FOUND"),
      "Esse item não existe mais. Atualizamos o resumo.",
    ],
    [
      "RATE_LIMITED",
      () => api.fail("/api/sync/push", problem(429, "RATE_LIMITED", { "retry-after": "7" })),
      "Muitas tentativas. Tente de novo em 7 segundos.",
    ],
    [
      "a network failure",
      () => api.fail("/api/sync/push", "network"),
      "Sem conexão com o servidor.",
    ],
  ])(
    "[outline-node/screens#AC-8] shows the message of %s and pulls the tree again",
    async (_n, fail, message) => {
      const user = userEvent.setup();
      await open();
      await select(user, "B");
      const pullsBefore = api.pulls;
      fail();

      key("Tab");

      expect(await screen.findByText((text) => text.includes(message))).toBeTruthy();
      await waitFor(() => expect(api.pulls).toBeGreaterThan(pullsBefore));
      expect(ids()).toEqual(["A", "B"]);
      expect(rows().every((r) => r.getAttribute("aria-level") === "1")).toBe(true);
    },
  );

  it("[outline-node/screens#AC-8] goes to the sign-in screen when the session is gone", async () => {
    const user = userEvent.setup();
    await open();
    await select(user, "B");
    api.fail("/api/sync/push", problem(401, "UNAUTHENTICATED"));

    key("Tab");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});

describe("summary: flashcards", () => {
  const rowOf = (id: string) => rows().find((r) => r.getAttribute("data-node-id") === id)!;
  const create = (row: HTMLElement) =>
    within(row).queryByRole("button", { name: "Criar flashcard" });

  beforeEach(() => {
    api.highlights = [
      highlight("h1", "c2", "Roteador encaminha pacotes"),
      highlight("h2", "c3", "Exemplo de RIP"),
    ];
    api.nodes = [
      { ...free("own", null, "a0", "Ponte liga redes", "DEFINITION") },
      { ...free("cat", null, "a1"), highlightId: "h1", role: null, text: null },
      { ...free("over", null, "a2"), highlightId: "h1", role: "ITEM", text: null },
      { ...free("item", null, "a3"), highlightId: "h2", role: null, text: null },
    ];
  });

  it("[flashcard/screens#AC-1] offers to create a flashcard only on nodes whose effective role is DEFINITION", async () => {
    await open();

    expect(create(rowOf("own"))).toBeTruthy();
    expect(create(rowOf("cat"))).toBeTruthy();
    expect(create(rowOf("over"))).toBeNull();
    expect(create(rowOf("item"))).toBeNull();
  });

  it("[flashcard/screens#AC-1] opens the field with the key C for a selected definition and does nothing for another", async () => {
    const user = userEvent.setup();
    await open();

    await select(user, "item");
    key("c");
    expect(screen.queryByLabelText("Frente do flashcard")).toBeNull();
    key("c");
    await select(user, "cat");
    key("c");
    expect(await screen.findByLabelText("Frente do flashcard")).toBeTruthy();
  });

  it("[flashcard/screens#AC-1] does not open the field with C when no node is selected", async () => {
    await open();

    key("c");

    expect(screen.queryByLabelText("Frente do flashcard")).toBeNull();
  });

  it("[flashcard/screens#AC-2] creates the card with one upsert of id, source and trimmed front, then shows one flashcard", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(create(rowOf("own"))!);
    await user.type(screen.getByLabelText("Frente do flashcard"), "  O que é uma ponte?  ");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(screen.queryByLabelText("Frente do flashcard")).toBeNull());
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]).toHaveLength(1);
    const sent = api.batches[0]![0]!;
    expect(sent).toMatchObject({ entity: "flashcard", op: "upsert" });
    expect(sent.data).toEqual({
      id: expect.stringMatching(UUID_V7),
      sourceNodeId: "own",
      front: "O que é uma ponte?",
    });
    expect(api.flashcards[0]!.back).toBe("Ponte liga redes");
    const link = await within(rowOf("own")).findByRole("link", { name: "1 flashcard" });
    expect(link.getAttribute("href")).toBe("/documents/d1/flashcards");
  });

  it("[flashcard/screens#AC-2] refuses a blank front without sending, and Escape closes the field", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(create(rowOf("own"))!);
    await user.type(screen.getByLabelText("Frente do flashcard"), "   ");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe a frente do flashcard.",
    );
    expect(api.batches).toEqual([]);
    fireEvent.keyDown(screen.getByLabelText("Frente do flashcard"), { key: "Escape" });
    expect(screen.queryByLabelText("Frente do flashcard")).toBeNull();
    expect(api.batches).toEqual([]);
  });

  it("[flashcard/screens#AC-7] shows the message of the rejection and keeps the field", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(create(rowOf("own"))!);
    await user.type(screen.getByLabelText("Frente do flashcard"), "Ponte");
    api.rejectNext("FLASHCARD_REQUIRES_DEFINITION");

    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(
      await screen.findByText("Só é possível criar flashcard a partir de uma definição."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Frente do flashcard")).toBeTruthy();
    expect(api.flashcards).toEqual([]);
  });

  it("[flashcard/screens#AC-7] goes to the sign-in screen when the session is gone", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(create(rowOf("own"))!);
    await user.type(screen.getByLabelText("Frente do flashcard"), "Ponte");
    api.fail("/api/sync/push", problem(401, "UNAUTHENTICATED"));

    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it("[flashcard/screens#AC-8] links the cards page from the header, and counts the cards of each node", async () => {
    api.flashcards = [
      { id: "f1", documentId: "d1", sourceNodeId: "own", front: "A", back: "x" },
      { id: "f2", documentId: "d1", sourceNodeId: "own", front: "B", back: "x" },
      { id: "f3", documentId: "d1", sourceNodeId: "cat", front: "C", back: "x" },
    ];
    await open();

    expect(screen.getByRole("link", { name: "Flashcards" }).getAttribute("href")).toBe(
      "/documents/d1/flashcards",
    );
    expect(within(rowOf("own")).getByRole("link", { name: "2 flashcards" })).toBeTruthy();
    expect(within(rowOf("cat")).getByRole("link", { name: "1 flashcard" })).toBeTruthy();
    expect(within(rowOf("item")).queryByRole("link", { name: /flashcard/ })).toBeNull();
  });
});

describe("summary: the PDF export", () => {
  it("[export/summary-pdf#AC-6] exports the summary of this document as a PDF", async () => {
    api.exportAnswers = [{ status: "RUNNING", error: null }]; // the page does not navigate in jsdom
    api.nodes = [free("n1", null, "a0")];
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Exportar resumo (PDF)" }));

    await waitFor(() =>
      expect(api.exportRequests).toEqual([
        { kind: "SUMMARY_PDF", scope: "DOCUMENT", scopeId: "d1" },
      ]),
    );
  });
});
