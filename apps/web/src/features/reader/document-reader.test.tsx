import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { makeFakeSurface, ready } from "../../test/fake-surface";
import { problem, renderPt } from "../../test/render";
import { DocumentReader } from "./document-reader";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

let api: FakeApi;
let surface: ReturnType<typeof makeFakeSurface>;
beforeEach(() => {
  api = new FakeApi();
  api.subjects = [{ id: "s-redes", name: "Redes" }];
  api.documents = [
    { id: "d1", subjectId: "s-redes", title: "Aula 1", status: "READY", pageCount: 10 },
  ];
  surface = makeFakeSurface();
  push.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});

const open = (id = "d1") => renderPt(<DocumentReader documentId={id} Surface={surface.Surface} />);
const opened = async (state = ready()) => {
  open();
  await screen.findByTestId("surface");
  surface.emit(state);
  await screen.findByText(/Página \d+ de \d+/);
};

describe("reader: before the document opens", () => {
  it.each([
    ["missing", "nao-existe"],
    ["of another person", "d-de-outra-pessoa"],
  ])("[document/reader#AC-1] says the document was not found when it is %s", async (_n, id) => {
    open(id);

    expect(await screen.findByText("Documento não encontrado.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar às matérias" }).getAttribute("href")).toBe("/");
    expect(api.fileRequests).toEqual([]);
  });

  it("[document/reader#AC-1] says the document was deleted when it is in the trash", async () => {
    api.documents = [];
    open();

    expect(await screen.findByText("Documento não encontrado.")).toBeTruthy();
  });

  it.each([
    ["UPLOADED", "Este documento ainda está sendo preparado."],
    ["VALIDATING", "Este documento ainda está sendo preparado."],
    ["REJECTED", "Este documento foi recusado e não pode ser aberto."],
    ["QUARANTINED", "Este documento foi bloqueado e não pode ser aberto."],
  ])(
    "[document/reader#AC-1] explains a %s document, links to its subject and does not ask for the file",
    async (status, message) => {
      api.documents = [{ id: "d1", subjectId: "s-redes", title: "Aula 1", status }];
      open();

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Voltar à matéria" }).getAttribute("href")).toBe(
        "/subjects/s-redes",
      );
      expect(api.fileRequests).toEqual([]);
      expect(surface.mounts).toBe(0);
    },
  );

  it("[document/reader#AC-2] asks for the file URL once and gives the surface a source that fetches the bytes", async () => {
    open();

    await screen.findByTestId("surface");

    expect(api.fileRequests).toEqual(["d1"]);
    await waitFor(() => expect(surface.sourceBytes).not.toBeNull());
    expect(new TextDecoder().decode(surface.sourceBytes!)).toBe("%PDF-1.4 fake");
    expect(screen.getByRole("heading", { name: "Aula 1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar à matéria" }).getAttribute("href")).toBe(
      "/subjects/s-redes",
    );
  });

  it.each([
    ["NOT_FOUND", problem(404, "NOT_FOUND"), "Documento não encontrado."],
    [
      "DOCUMENT_NOT_READY",
      problem(409, "DOCUMENT_NOT_READY"),
      "Este documento ainda está sendo preparado.",
    ],
    [
      "RATE_LIMITED",
      problem(429, "RATE_LIMITED", { "retry-after": "8" }),
      "Muitas tentativas. Tente de novo em 8 segundos.",
    ],
    ["a network failure", "network" as const, "Sem conexão com o servidor."],
  ])(
    "[document/reader#AC-2] shows the message of %s from the file request and a link back",
    async (_n, answer, message) => {
      api.fail("/api/documents/d1/file", answer);
      open();

      expect(await screen.findByText((text) => text.includes(message))).toBeTruthy();
      expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
      expect(surface.mounts).toBe(0);
    },
  );

  it("[document/reader#AC-2] goes to the sign-in screen when the session is gone", async () => {
    api.fail("/api/documents/d1/file", problem(401, "UNAUTHENTICATED"));
    open();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it("[document/reader#AC-3] shows loading, then the bar when the surface is ready", async () => {
    open();
    await screen.findByTestId("surface");

    expect(screen.getByText("Carregando documento…")).toBeTruthy();
    surface.emit(ready({ pageCount: 12, currentPage: 3, zoom: 1.5 }));

    expect(await screen.findByText("Página 3 de 12")).toBeTruthy();
    expect(screen.getByText("150%")).toBeTruthy();
    expect(screen.queryByText("Carregando documento…")).toBeNull();
  });

  it("[document/reader#AC-3] says the document could not be opened when the surface fails, with a link back", async () => {
    open();
    await screen.findByTestId("surface");

    surface.emit({ status: "error" });

    expect(await screen.findByText("Não foi possível abrir o documento.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar à matéria" })).toBeTruthy();
  });
});

describe("reader: the bar", () => {
  it("[document/reader#AC-4] disables previous on the first page and next on the last", async () => {
    await opened(ready({ pageCount: 5, currentPage: 1 }));
    const previous = screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Próxima página" }) as HTMLButtonElement;
    expect([previous.disabled, next.disabled]).toEqual([true, false]);

    surface.emit(ready({ pageCount: 5, currentPage: 5 }));

    await waitFor(() => expect([previous.disabled, next.disabled]).toEqual([false, true]));
  });

  it("[document/reader#AC-4] goes to the neighbour pages with the buttons", async () => {
    const user = userEvent.setup();
    await opened(ready({ pageCount: 5, currentPage: 3 }));

    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await user.click(screen.getByRole("button", { name: "Página anterior" }));

    expect(surface.controls.goToPage.mock.calls).toEqual([[4], [2]]);
  });

  it("[document/reader#AC-4] goes to a valid page typed with Enter", async () => {
    const user = userEvent.setup();
    await opened(ready({ pageCount: 10, currentPage: 1 }));

    const field = screen.getByLabelText("Ir para a página");
    await user.clear(field);
    await user.type(field, "7{Enter}");

    expect(surface.controls.goToPage).toHaveBeenCalledWith(7);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["0", "11", "-3", "abc", "2.5", ""])(
    "[document/reader#AC-4] refuses %j without moving",
    async (typed) => {
      const user = userEvent.setup();
      await opened(ready({ pageCount: 10, currentPage: 4 }));

      const field = screen.getByLabelText("Ir para a página");
      await user.clear(field);
      if (typed) await user.type(field, typed);
      await user.type(field, "{Enter}");

      expect((await screen.findByRole("alert")).textContent).toContain(
        "Digite uma página de 1 a 10.",
      );
      expect(surface.controls.goToPage).not.toHaveBeenCalled();
    },
  );

  it("[document/reader#AC-5] zooms through the buttons and follows the zoom of the surface", async () => {
    const user = userEvent.setup();
    await opened(ready({ zoom: 1 }));

    await user.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    await user.click(screen.getByRole("button", { name: "Diminuir zoom" }));
    await user.click(screen.getByRole("button", { name: "Ajustar à largura" }));
    surface.emit(ready({ zoom: 1.25 }));

    expect(surface.controls.zoomIn).toHaveBeenCalledTimes(1);
    expect(surface.controls.zoomOut).toHaveBeenCalledTimes(1);
    expect(surface.controls.fitWidth).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("125%")).toBeTruthy();
  });

  it.each([
    ["zoom in", { canZoomIn: false, canZoomOut: true }, [true, false]],
    ["zoom out", { canZoomIn: true, canZoomOut: false }, [false, true]],
  ])(
    "[document/reader#AC-5] disables only %s when the surface cannot honour it",
    async (_n, state, expected) => {
      await opened(ready(state));

      const buttons = [
        screen.getByRole("button", { name: "Aumentar zoom" }),
        screen.getByRole("button", { name: "Diminuir zoom" }),
      ] as HTMLButtonElement[];

      expect(buttons.map((b) => b.disabled)).toEqual(expected);
    },
  );

  it("[document/reader#AC-6] zooms and fits with + - 0 outside a text field", async () => {
    await opened();

    fireEvent.keyDown(document.body, { key: "+" });
    fireEvent.keyDown(document.body, { key: "-" });
    fireEvent.keyDown(document.body, { key: "0" });

    expect(surface.controls.zoomIn).toHaveBeenCalledTimes(1);
    expect(surface.controls.zoomOut).toHaveBeenCalledTimes(1);
    expect(surface.controls.fitWidth).toHaveBeenCalledTimes(1);
  });

  it("[document/reader#AC-6] types in the page field instead of zooming, and ignores shortcuts with a modifier", async () => {
    const user = userEvent.setup();
    await opened();

    const field = screen.getByLabelText("Ir para a página");
    await user.clear(field);
    await user.type(field, "+-0");
    fireEvent.keyDown(document.body, { key: "+", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "-", metaKey: true });

    expect((field as HTMLInputElement).value).toBe("+-0");
    expect(surface.controls.zoomIn).not.toHaveBeenCalled();
    expect(surface.controls.zoomOut).not.toHaveBeenCalled();
    expect(surface.controls.fitWidth).not.toHaveBeenCalled();
  });

  it("[document/reader#AC-6] gives every control of the bar an accessible name", async () => {
    await opened();

    const bar = screen.getByRole("toolbar");
    const names = within(bar)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);

    expect(names).toEqual([
      "Página anterior",
      "Próxima página",
      "Diminuir zoom",
      "Aumentar zoom",
      "Ajustar à largura",
    ]);
    expect(within(bar).getByLabelText("Ir para a página")).toBeTruthy();
  });
});

describe("reader: the summary link", () => {
  it("[outline-node/screens#AC-10] links to the summary of the document from the bar", async () => {
    await opened();

    const link = screen.getByRole("link", { name: "Resumo" });

    expect(link.getAttribute("href")).toBe("/documents/d1/summary");
    expect(within(screen.getByRole("toolbar")).getByRole("link", { name: "Resumo" })).toBe(link);
  });
});

describe("reader: a document without selectable text", () => {
  const notice = /Este PDF é uma imagem escaneada e não tem texto selecionável/;

  it("[document/textless#AC-5] warns about a scanned document and still opens it", async () => {
    api.documents = [
      { id: "d1", subjectId: "s-redes", title: "Escaneado", status: "READY", hasText: false },
    ];

    await opened();

    expect(screen.getByText(notice)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Escaneado" })).toBeTruthy();
  });

  it.each([[true], [null]])(
    "[document/textless#AC-5] shows no notice when hasText is %s",
    async (hasText) => {
      api.documents = [
        { id: "d1", subjectId: "s-redes", title: "Aula 1", status: "READY", hasText },
      ];

      await opened();

      expect(screen.queryByText(notice)).toBeNull();
    },
  );
});
