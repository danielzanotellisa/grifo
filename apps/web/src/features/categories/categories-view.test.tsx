import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { problem, renderPt } from "../../test/render";
import { CategoriesView } from "./categories-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const category = (
  id: string,
  name: string,
  position: string,
  over: Partial<FakeApi["categories"][number]> = {},
): FakeApi["categories"][number] => ({
  id,
  name,
  color: "#4F8EF7",
  role: "TOPIC",
  shortcut: null,
  position,
  ...over,
});
let api: FakeApi;
beforeEach(() => {
  api = new FakeApi();
  api.categories = [
    category("c1", "Tópico", "a0", { shortcut: 1 }),
    category("c2", "Definição", "a1", { role: "DEFINITION", color: "#F7D04F", shortcut: 2 }),
    category("c3", "Exemplo", "a2", { role: "ITEM", color: "#5BC17F" }),
  ];
  push.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});

const open = async () => {
  renderPt(<CategoriesView />);
  await screen.findByRole("list", { name: "Categorias" });
};
const rows = () =>
  within(screen.getByRole("list", { name: "Categorias" })).getAllByRole("listitem");
const names = () => rows().map((r) => r.querySelector("[data-name]")?.textContent);
const row = (name: string) =>
  rows().find((r) => r.querySelector("[data-name]")?.textContent === name)!;

describe("categories: the list", () => {
  it("[category/screens#AC-1] lists the live categories by position with color, name, role and shortcut", async () => {
    api.categories = [
      category("c2", "Definição", "a1", { role: "DEFINITION", color: "#F7D04F", shortcut: 2 }),
      category("c1", "Tópico", "a0", { shortcut: 1 }),
    ];
    api.highlights = [];
    api.others = [{ entity: "subject", entityId: "x", data: { id: "x", name: "Redes" } }];
    await open();

    expect(names()).toEqual(["Tópico", "Definição"]);
    expect(row("Definição").textContent).toContain("Definição");
    expect(row("Definição").textContent).toContain("2");
    expect(row("Tópico").querySelector("[data-color]")?.getAttribute("data-color")).toBe("#4F8EF7");
    expect(row("Tópico").textContent).toContain("Tópico");
  });

  it("[category/screens#AC-1] says there are no categories", async () => {
    api.categories = [];
    renderPt(<CategoriesView />);

    expect(await screen.findByText(/Você não tem categorias/)).toBeTruthy();
  });
});

describe("categories: create", () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.type(screen.getByLabelText("Nome da nova categoria"), name);
  };

  it("[category/screens#AC-2] sends one upsert with a new id, the trimmed name and a position after the last", async () => {
    const user = userEvent.setup();
    await open();

    await fill(user, "  Atenção  ");
    fireEvent.change(screen.getByLabelText("Cor da nova categoria"), {
      target: { value: "#aa00bb" },
    });
    await user.selectOptions(screen.getByLabelText("Papel da nova categoria"), "ITEM");
    await user.selectOptions(screen.getByLabelText("Atalho da nova categoria"), "5");
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));

    await waitFor(() => expect(names()).toContain("Atenção"));
    expect(api.batches).toHaveLength(1);
    const sent = api.batches[0]![0]!;
    expect(sent).toMatchObject({ entity: "category", op: "upsert" });
    expect(sent.data).toEqual({
      id: expect.stringMatching(UUID_V7),
      name: "Atenção",
      color: "#aa00bb",
      role: "ITEM",
      shortcut: 5,
      position: expect.any(String),
    });
    expect(String(sent.data.position) > "a2").toBe(true);
    expect(names()).toEqual(["Tópico", "Definição", "Exemplo", "Atenção"]);
  });

  it("[category/screens#AC-2] sends a null shortcut when none is chosen, and clears the form", async () => {
    const user = userEvent.setup();
    await open();

    await fill(user, "Sem atalho");
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));

    await waitFor(() => expect(names()).toContain("Sem atalho"));
    expect(api.batches[0]![0]!.data.shortcut).toBeNull();
    expect((screen.getByLabelText("Nome da nova categoria") as HTMLInputElement).value).toBe("");
  });

  it.each([
    ["blank", "   "],
    ["too long", "x".repeat(41)],
  ])("[category/screens#AC-2] refuses a %s name without sending", async (_n, name) => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText("Nome da nova categoria"), name);
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "O nome precisa ter de 1 a 40 caracteres.",
    );
    expect(api.batches).toEqual([]);
  });
});

describe("categories: edit and reorder", () => {
  it("[category/screens#AC-3] edits with one upsert that keeps the id and the position, and Escape cancels", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Editar Exemplo" }));
    const name = screen.getByLabelText("Nome da categoria");
    await user.clear(name);
    await user.type(name, "Caso prático");
    await user.selectOptions(screen.getByLabelText("Papel da categoria"), "IGNORE");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(names()).toContain("Caso prático"));
    expect(api.batches[0]![0]!.data).toEqual({
      id: "c3",
      name: "Caso prático",
      color: "#5BC17F",
      role: "IGNORE",
      shortcut: null,
      position: "a2",
    });

    await user.click(screen.getByRole("button", { name: "Editar Caso prático" }));
    fireEvent.keyDown(screen.getByLabelText("Nome da categoria"), { key: "Escape" });
    expect(screen.queryByLabelText("Nome da categoria")).toBeNull();
    expect(api.batches).toHaveLength(1);
  });

  it("[category/screens#AC-4] moves a category with one upsert between its new neighbors", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(
      within(row("Exemplo")).getByRole("button", { name: "Mover Exemplo para cima" }),
    );

    await waitFor(() => expect(names()).toEqual(["Tópico", "Exemplo", "Definição"]));
    expect(api.batches).toHaveLength(1);
    const { data } = api.batches[0]![0]!;
    expect(data).toMatchObject({ id: "c3", name: "Exemplo" });
    expect(String(data.position) > "a0" && String(data.position) < "a1").toBe(true);
  });

  it("[category/screens#AC-4] moves down, and the first cannot go up nor the last down", async () => {
    const user = userEvent.setup();
    await open();

    expect(
      (screen.getByRole("button", { name: "Mover Tópico para cima" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Mover Exemplo para baixo" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Mover Tópico para baixo" }));

    await waitFor(() => expect(names()).toEqual(["Definição", "Tópico", "Exemplo"]));
    const { data } = api.batches[0]![0]!;
    expect(String(data.position) > "a1" && String(data.position) < "a2").toBe(true);
  });
});

describe("categories: delete", () => {
  it("[category/screens#AC-5] deletes one that is not in use with one delete and says it went to the trash", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Apagar Exemplo" }));

    await waitFor(() => expect(names()).toEqual(["Tópico", "Definição"]));
    expect(api.batches[0]).toEqual([
      expect.objectContaining({ entity: "category", op: "delete", data: { id: "c3" } }),
    ]);
    expect(screen.getByRole("status").textContent).toContain("“Exemplo” foi para a lixeira.");
  });

  const inUse = () => {
    api.highlights = [
      {
        id: "h1",
        documentId: "d1",
        categoryId: "c3",
        pageIndex: 0,
        rects: [],
        quote: { exact: "x", prefix: "", suffix: "" },
        note: null,
      },
    ];
  };

  it("[category/screens#AC-5] asks where to move the highlights of a category in use, and moves them with the delete", async () => {
    inUse();
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Apagar Exemplo" }));
    await user.selectOptions(await screen.findByLabelText("Mover as marcações para"), "c1");
    await user.click(screen.getByRole("button", { name: "Mover e apagar" }));

    await waitFor(() => expect(names()).toEqual(["Tópico", "Definição"]));
    expect(api.batches[1]![0]!.data).toEqual({ id: "c3", moveHighlightsTo: "c1" });
    expect(api.highlights[0]!.categoryId).toBe("c1");
  });

  it("[category/screens#AC-5] keeps everything when the choice is cancelled", async () => {
    inUse();
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Apagar Exemplo" }));
    await screen.findByLabelText("Mover as marcações para");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Mover as marcações para")).toBeNull();
    expect(names()).toEqual(["Tópico", "Definição", "Exemplo"]);
    expect(api.batches).toHaveLength(1);
  });

  it("[category/screens#AC-5] says the last category cannot be deleted", async () => {
    api.categories = [category("c1", "Tópico", "a0")];
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Apagar Tópico" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "A última categoria não pode ser apagada.",
    );
    expect(names()).toEqual(["Tópico"]);
  });
});

describe("categories: failures", () => {
  it.each([
    ["CATEGORY_NAME_TAKEN", "Já existe uma categoria com esse nome."],
    ["CATEGORY_SHORTCUT_TAKEN", "Esse atalho já é de outra categoria."],
    ["COLOR_INVALID", "Escolha uma cor válida."],
    ["NOT_FOUND", "Essa categoria não existe mais. Atualizamos a lista."],
    ["CATEGORY_INVALID", "Essa categoria não é válida."],
  ])("[category/screens#AC-6] shows the message of %s", async (code, message) => {
    const user = userEvent.setup();
    await open();
    api.rejectNext(code);

    await user.click(screen.getByRole("button", { name: "Apagar Exemplo" }));

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(names()).toEqual(["Tópico", "Definição", "Exemplo"]);
  });

  it.each([
    [
      "RATE_LIMITED",
      () => api.fail("/api/sync/push", problem(429, "RATE_LIMITED", { "retry-after": "4" })),
      "Tente de novo em 4 segundos.",
    ],
    [
      "a network failure",
      () => api.fail("/api/sync/push", "network"),
      "Sem conexão com o servidor.",
    ],
  ])("[category/screens#AC-6] shows the message of %s", async (_n, arrange, message) => {
    const user = userEvent.setup();
    await open();
    arrange();

    await user.click(screen.getByRole("button", { name: "Apagar Exemplo" }));

    expect((await screen.findByRole("alert")).textContent).toContain(message);
  });

  it("[category/screens#AC-6] goes to the sign-in screen when the session is gone", async () => {
    const user = userEvent.setup();
    await open();
    api.fail("/api/sync/push", problem(401, "UNAUTHENTICATED"));

    await user.click(screen.getByRole("button", { name: "Apagar Exemplo" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});

describe("categories: undoing a delete", () => {
  it("[_cross-cutting/undo#AC-5] offers Desfazer after deleting a category and puts it back", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Apagar Exemplo" }));
    await screen.findByRole("status");
    expect(names()).toEqual(["Tópico", "Definição"]);
    await user.click(screen.getByRole("button", { name: "Desfazer" }));

    await waitFor(() => expect(names()).toEqual(["Tópico", "Definição", "Exemplo"]));
    expect(api.restores).toEqual(["c3"]);
  });

  it("[_cross-cutting/undo#AC-8] shows the message of a restore that fails", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("button", { name: "Apagar Exemplo" }));
    await screen.findByRole("status");
    api.fail("/api/trash", problem(409, "CATEGORY_NAME_TAKEN"));

    await user.click(screen.getByRole("button", { name: "Desfazer" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Já existe uma categoria com esse nome.",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
