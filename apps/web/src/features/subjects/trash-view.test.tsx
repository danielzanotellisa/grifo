import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { problem, renderPt } from "../../test/render";
import { SubjectsView } from "./subjects-view";
import { TrashView } from "./trash-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

let api: FakeApi;
beforeEach(() => {
  api = new FakeApi();
  push.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});
const date = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(iso));

describe("trash view", () => {
  it("[subject/screens#AC-5] lists the items with label, kind and date, as the API orders them, or says it is empty", async () => {
    api.trash = [
      { id: "d1", entity: "document", label: "Aula 3", deletedAt: "2026-11-20T10:00:00Z" },
      { id: "s1", entity: "subject", label: "Redes", deletedAt: "2026-11-10T10:00:00Z" },
    ];
    const { unmount } = renderPt(<TrashView />);

    await screen.findByText("Aula 3");

    const items = screen.getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Aula 3"),
      expect.stringContaining("Redes"),
    ]);
    expect(within(items[0]!).getByText("Documento")).toBeTruthy();
    expect(within(items[0]!).getByText(new RegExp(date("2026-11-20T10:00:00Z")))).toBeTruthy();
    expect(within(items[1]!).getByText("Matéria")).toBeTruthy();
    unmount();

    api.trash = [];
    renderPt(<TrashView />);
    expect(await screen.findByText("A lixeira está vazia.")).toBeTruthy();
  });

  it("[subject/screens#AC-5] restores an item, which leaves the trash and, for a subject, returns to the list", async () => {
    api.trash = [
      { id: "s1", entity: "subject", label: "Redes", deletedAt: "2026-11-10T10:00:00Z" },
    ];
    const user = userEvent.setup();
    const { unmount } = renderPt(<TrashView />);
    await screen.findByText("Redes");

    await user.click(screen.getByRole("button", { name: "Restaurar Redes" }));

    await screen.findByText("A lixeira está vazia.");
    expect(api.restores).toEqual(["s1"]);
    unmount();
    renderPt(<SubjectsView />);
    expect(await screen.findByText("Redes")).toBeTruthy();
  });

  it("[subject/screens#AC-6] says to restore the parent first on PARENT_DELETED and keeps the item", async () => {
    api.trash = [
      {
        id: "d1",
        entity: "document",
        label: "Aula 3",
        deletedAt: "2026-11-20T10:00:00Z",
        parentDeleted: true,
      },
    ];
    const user = userEvent.setup();
    renderPt(<TrashView />);
    await screen.findByText("Aula 3");

    await user.click(screen.getByRole("button", { name: "Restaurar Aula 3" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Restaure primeiro o item ao qual este pertence.",
    );
    expect(screen.getByText("Aula 3")).toBeTruthy();
  });

  it.each([
    ["NOT_FOUND", problem(404, "NOT_FOUND"), "Esse item não está mais na lixeira."],
    ["a network failure", "network" as const, "Sem conexão com o servidor."],
  ])(
    "[subject/screens#AC-6] shows the message of %s and keeps the item",
    async (_n, answer, message) => {
      api.trash = [
        { id: "s1", entity: "subject", label: "Redes", deletedAt: "2026-11-10T10:00:00Z" },
      ];
      const user = userEvent.setup();
      renderPt(<TrashView />);
      await screen.findByText("Redes");
      api.fail("/api/trash/s1/restore", answer);

      await user.click(screen.getByRole("button", { name: "Restaurar Redes" }));

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      await waitFor(() => expect(screen.getByText("Redes")).toBeTruthy());
    },
  );

  it("[subject/screens#AC-6] goes to the sign-in screen when the session is gone", async () => {
    api.fail("/api/trash", problem(401, "UNAUTHENTICATED"));
    renderPt(<TrashView />);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it("[subject/screens#AC-7] restores once and disables the button while pending", async () => {
    api.trash = [
      { id: "s1", entity: "subject", label: "Redes", deletedAt: "2026-11-10T10:00:00Z" },
    ];
    const user = userEvent.setup();
    renderPt(<TrashView />);
    await screen.findByText("Redes");

    const button = screen.getByRole("button", { name: "Restaurar Redes" });
    await user.dblClick(button);

    await screen.findByText("A lixeira está vazia.");
    expect(api.restores).toEqual(["s1"]);
  });
});
