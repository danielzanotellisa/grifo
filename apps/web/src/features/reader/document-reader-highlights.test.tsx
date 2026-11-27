import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { makeFakeSurface, ready } from "../../test/fake-surface";
import { problem, renderPt } from "../../test/render";
import { DocumentReader } from "./document-reader";
import type { SelectionInfo } from "./reader-surface";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const C1 = {
  id: "c1",
  name: "Tópico",
  color: "#4F8EF7",
  role: "TOPIC",
  shortcut: 1,
  position: "a0",
};
const C2 = {
  id: "c2",
  name: "Definição",
  color: "#F7D04F",
  role: "DEFINITION",
  shortcut: 2,
  position: "a1",
};
const C3 = {
  id: "c3",
  name: "Exemplo",
  color: "#5BC17F",
  role: "ITEM",
  shortcut: 3,
  position: "a2",
};
const rect = (y1: number) => ({ x1: 50, y1, x2: 200, y2: y1 + 12 });
const highlight = (
  id: string,
  pageIndex: number,
  y1: number,
  exact: string,
  categoryId = "c1",
  documentId = "d1",
) => ({
  id,
  documentId,
  categoryId,
  pageIndex,
  rects: [rect(y1)],
  quote: { exact, prefix: "antes ", suffix: " depois" },
  note: null,
});
const selected = (...pages: SelectionInfo["pages"]): SelectionInfo => ({
  pages,
  anchor: { x: 120, y: 90 },
});
const onPage0 = {
  pageIndex: 0,
  rects: [rect(700)],
  exact: "O método científico",
  prefix: "texto antes ",
  suffix: " texto depois",
};

let api: FakeApi;
let surface: ReturnType<typeof makeFakeSurface>;
beforeEach(() => {
  api = new FakeApi();
  api.subjects = [{ id: "s-redes", name: "Redes" }];
  api.documents = [
    { id: "d1", subjectId: "s-redes", title: "Aula 1", status: "READY", pageCount: 10 },
    { id: "d2", subjectId: "s-redes", title: "Aula 2", status: "READY", pageCount: 5 },
  ];
  api.categories = [C2, C3, C1]; // out of order on purpose: the bar sorts by position
  surface = makeFakeSurface();
  push.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});

const open = async () => {
  renderPt(<DocumentReader documentId="d1" Surface={surface.Surface} />);
  await screen.findByTestId("surface");
  surface.emit(ready({ pageCount: 10 }));
  await screen.findByText(/Página \d+ de \d+/);
};
const panel = () => screen.getByRole("complementary", { name: "Marcações" });
const items = () => within(panel()).queryAllByRole("listitem");
const menu = () => screen.queryByRole("menu", { name: "Marcar seleção" });

describe("highlights: what the reader shows", () => {
  it("[highlight/screens#AC-1] shows the live categories by position and only the highlights of this document, in reading order", async () => {
    api.highlights = [
      highlight("h-p2", 2, 400, "Terceira página"),
      highlight("h-low", 0, 100, "Embaixo da primeira"),
      highlight("h-high", 0, 600, "Em cima da primeira", "c2"),
      highlight("h-other", 0, 300, "De outro documento", "c1", "d2"),
    ];
    await open();

    const bar = screen.getByRole("group", { name: "Categorias" });
    expect(
      within(bar)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Tópico1", "Definição2", "Exemplo3"]);
    await waitFor(() => expect(items()).toHaveLength(3));
    expect(items().map((i) => i.textContent)).toEqual([
      expect.stringContaining("Em cima da primeira"),
      expect.stringContaining("Embaixo da primeira"),
      expect.stringContaining("Terceira página"),
    ]);
    expect(within(items()[0]!).getByText("Página 1")).toBeTruthy();
    expect(within(items()[2]!).getByText("Página 3")).toBeTruthy();
    expect(screen.queryByText("De outro documento")).toBeNull();
  });

  it("[highlight/screens#AC-1] says there are no highlights yet", async () => {
    await open();

    expect(await screen.findByText("Nenhuma marcação neste documento ainda.")).toBeTruthy();
  });

  it("[highlight/screens#AC-1] cuts a long quote in the panel to 120 characters", async () => {
    api.highlights = [highlight("h1", 0, 100, "x".repeat(300))];
    await open();

    await waitFor(() => expect(items()).toHaveLength(1));

    expect(items()[0]!.textContent).toContain(`${"x".repeat(120)}…`);
    expect(items()[0]!.textContent).not.toContain("x".repeat(121));
  });

  it("[highlight/screens#AC-5] gives the surface every highlight with its page, rects and the color of its category", async () => {
    api.highlights = [highlight("h1", 3, 200, "Um", "c2"), highlight("h2", 0, 50, "Dois", "c1")];
    await open();

    await waitFor(() => expect(surface.lastProps!.highlights).toHaveLength(2));

    expect(surface.lastProps!.highlights).toEqual(
      expect.arrayContaining([
        { id: "h1", pageIndex: 3, rects: [rect(200)], color: "#F7D04F" },
        { id: "h2", pageIndex: 0, rects: [rect(50)], color: "#4F8EF7" },
      ]),
    );
  });
});

describe("highlights: marking", () => {
  it("[highlight/screens#AC-2] creates a highlight from the menu with one upsert, then lists it and clears the selection", async () => {
    const user = userEvent.setup();
    await open();
    surface.select(selected(onPage0));

    const choices = within(menu()!).getAllByRole("menuitem");
    expect(choices.map((c) => c.textContent)).toEqual(["Tópico1", "Definição2", "Exemplo3"]);
    await user.click(within(menu()!).getByRole("menuitem", { name: /Definição/ }));

    await waitFor(() => expect(items()).toHaveLength(1));
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]).toHaveLength(1);
    const [mutation] = api.batches[0]!;
    expect(mutation).toMatchObject({ entity: "highlight", op: "upsert" });
    expect(mutation!.data).toEqual({
      id: expect.stringMatching(UUID_V7),
      documentId: "d1",
      categoryId: "c2",
      pageIndex: 0,
      rects: [rect(700)],
      quote: { exact: "O método científico", prefix: "texto antes ", suffix: " texto depois" },
      note: null,
    });
    expect(surface.controls.clearSelection).toHaveBeenCalled();
    await waitFor(() => expect(menu()).toBeNull());
    expect(items()[0]!.textContent).toContain("O método científico");
  });

  it("[highlight/screens#AC-3] uses the category of the digit that is pressed", async () => {
    await open();
    surface.select(selected(onPage0));

    fireEvent.keyDown(document.body, { key: "3" });

    await waitFor(() => expect(api.batches).toHaveLength(1));
    expect(api.batches[0]![0]!.data.categoryId).toBe("c3");
  });

  it("[highlight/screens#AC-3] does nothing without a selection, in a text field, with a modifier or for a digit no category has", async () => {
    const user = userEvent.setup();
    await open();

    fireEvent.keyDown(document.body, { key: "1" });
    surface.select(selected(onPage0));
    fireEvent.keyDown(document.body, { key: "9" });
    fireEvent.keyDown(document.body, { key: "1", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "1", metaKey: true });
    await user.type(screen.getByLabelText("Ir para a página"), "2");
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(api.batches).toEqual([]);
  });

  it("[highlight/screens#AC-3] clears the selection with Escape", async () => {
    await open();
    surface.select(selected(onPage0));
    expect(menu()).not.toBeNull();

    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => expect(menu()).toBeNull());
    expect(surface.controls.clearSelection).toHaveBeenCalled();
    expect(api.batches).toEqual([]);
  });

  it("[highlight/screens#AC-4] sends one upsert per page of a selection over two pages", async () => {
    const user = userEvent.setup();
    await open();
    const onPage1 = {
      pageIndex: 1,
      rects: [rect(80), rect(66)],
      exact: "continua aqui",
      prefix: "",
      suffix: " fim",
    };
    surface.select(selected(onPage0, onPage1));

    await user.click(within(menu()!).getByRole("menuitem", { name: /Tópico/ }));

    await waitFor(() => expect(items()).toHaveLength(2));
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]!.map((m) => m.data)).toMatchObject([
      { pageIndex: 0, rects: [rect(700)], quote: { exact: "O método científico" } },
      { pageIndex: 1, rects: [rect(80), rect(66)], quote: { exact: "continua aqui" } },
    ]);
    expect(new Set(api.batches[0]!.map((m) => m.data.id)).size).toBe(2);
  });
});

describe("highlights: the panel", () => {
  beforeEach(() => {
    api.highlights = [highlight("h1", 4, 300, "Uma passagem importante", "c1")];
  });

  it("[highlight/screens#AC-6] goes to the page of an item", async () => {
    const user = userEvent.setup();
    await open();
    await waitFor(() => expect(items()).toHaveLength(1));

    await user.click(within(items()[0]!).getByRole("button", { name: "Uma passagem importante" }));

    expect(surface.controls.goToPage).toHaveBeenCalledWith(5);
  });

  it("[highlight/screens#AC-6] changes the category with one upsert that touches nothing else, and the color follows", async () => {
    const user = userEvent.setup();
    await open();
    await waitFor(() => expect(items()).toHaveLength(1));

    await user.selectOptions(screen.getByLabelText("Categoria de Uma passagem importante"), "c3");

    await waitFor(() => expect(surface.lastProps!.highlights[0]!.color).toBe("#5BC17F"));
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]).toHaveLength(1);
    expect(api.batches[0]![0]).toMatchObject({
      entity: "highlight",
      op: "upsert",
      data: {
        id: "h1",
        documentId: "d1",
        categoryId: "c3",
        pageIndex: 4,
        rects: [rect(300)],
        quote: { exact: "Uma passagem importante", prefix: "antes ", suffix: " depois" },
        note: null,
      },
    });
  });

  it("[highlight/screens#AC-6] deletes with one delete, removes the item and says it went to the trash", async () => {
    const user = userEvent.setup();
    await open();
    await waitFor(() => expect(items()).toHaveLength(1));

    await user.click(
      screen.getByRole("button", { name: "Apagar marcação: Uma passagem importante" }),
    );

    await waitFor(() => expect(items()).toHaveLength(0));
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]![0]).toMatchObject({
      entity: "highlight",
      op: "delete",
      data: { id: "h1" },
    });
    expect(screen.getByRole("status").textContent).toContain("Marcação enviada para a lixeira.");
    expect(surface.lastProps!.highlights).toEqual([]);
  });
});

describe("highlights: failures", () => {
  it.each([
    [
      "HIGHLIGHT_EMPTY",
      () => api.rejectNext("HIGHLIGHT_EMPTY"),
      "O trecho selecionado está vazio.",
    ],
    [
      "HIGHLIGHT_INVALID",
      () => api.rejectNext("HIGHLIGHT_INVALID"),
      "Não foi possível marcar esse trecho.",
    ],
    [
      "DOCUMENT_NOT_READY",
      () => api.rejectNext("DOCUMENT_NOT_READY"),
      "O documento ainda não está pronto.",
    ],
    [
      "PARENT_DELETED",
      () => api.rejectNext("PARENT_DELETED"),
      "A categoria ou o documento não existe mais.",
    ],
    [
      "RATE_LIMITED",
      () => api.fail("/api/sync/push", problem(429, "RATE_LIMITED", { "retry-after": "12" })),
      "Muitas tentativas. Tente de novo em 12 segundos.",
    ],
    [
      "a network failure",
      () => api.fail("/api/sync/push", "network"),
      "Sem conexão com o servidor.",
    ],
  ])(
    "[highlight/screens#AC-7] shows the message of %s when creating and keeps the selection",
    async (_n, fail, message) => {
      const user = userEvent.setup();
      await open();
      surface.select(selected(onPage0));
      fail();

      await user.click(within(menu()!).getByRole("menuitem", { name: /Tópico/ }));

      expect(await screen.findByText((text) => text.includes(message))).toBeTruthy();
      expect(menu()).not.toBeNull();
      expect(surface.controls.clearSelection).not.toHaveBeenCalled();
      expect(items()).toHaveLength(0);
    },
  );

  it("[highlight/screens#AC-7] goes to the sign-in screen when the session is gone", async () => {
    const user = userEvent.setup();
    await open();
    surface.select(selected(onPage0));
    api.fail("/api/sync/push", problem(401, "UNAUTHENTICATED"));

    await user.click(within(menu()!).getByRole("menuitem", { name: /Tópico/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it("[highlight/screens#AC-7] keeps the list and shows the message when a delete or a category change is rejected", async () => {
    api.highlights = [highlight("h1", 0, 300, "Passagem", "c1")];
    const user = userEvent.setup();
    await open();
    await waitFor(() => expect(items()).toHaveLength(1));

    api.rejectNext("NOT_FOUND");
    await user.click(screen.getByRole("button", { name: "Apagar marcação: Passagem" }));
    expect(
      await screen.findByText((text) => text.includes("Essa marcação não existe mais.")),
    ).toBeTruthy();
    expect(items()).toHaveLength(1);

    api.fail("/api/sync/push", "network");
    await user.selectOptions(screen.getByLabelText("Categoria de Passagem"), "c2");
    expect(
      await screen.findByText((text) => text.includes("Sem conexão com o servidor.")),
    ).toBeTruthy();
    expect(surface.lastProps!.highlights[0]!.color).toBe("#4F8EF7");
  });
});
