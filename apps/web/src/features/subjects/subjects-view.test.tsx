import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { problem, renderPt } from "../../test/render";
import { SubjectsView } from "./subjects-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let api: FakeApi;
beforeEach(() => {
  api = new FakeApi();
  push.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});

const names = () =>
  screen.queryAllByRole("listitem").map((item) => item.querySelector("[data-name]")?.textContent);

describe("subjects view", () => {
  it("[subject/screens#AC-1] lists the subjects by name with their document counts, ignoring the rest", async () => {
    api.subjects = [
      { id: "s-redes", name: "Redes" },
      { id: "s-algebra", name: "Álgebra" },
      { id: "s-zoo", name: "Zoologia" },
    ];
    api.documents = [
      { id: "d1", subjectId: "s-redes" },
      { id: "d2", subjectId: "s-redes" },
      { id: "d3", subjectId: "s-zoo" },
    ];
    api.others = [{ entity: "category", entityId: "c1", data: { id: "c1", name: "Definição" } }];
    api.trash = [
      { id: "s-old", entity: "subject", label: "Antiga", deletedAt: "2026-11-01T00:00:00Z" },
    ];
    renderPt(<SubjectsView />);

    await screen.findByText("Redes");

    expect(names()).toEqual(["Álgebra", "Redes", "Zoologia"]);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Nenhum documento")).toBeTruthy();
    expect(within(items[1]!).getByText("2 documentos")).toBeTruthy();
    expect(within(items[2]!).getByText("1 documento")).toBeTruthy();
  });

  it("[subject/screens#AC-1] follows every page of the pull", async () => {
    api.pageSize = 1;
    api.subjects = ["Cálculo", "Direito", "Física"].map((name, i) => ({ id: `s${i}`, name }));
    renderPt(<SubjectsView />);

    await screen.findByText("Física");

    expect(names()).toEqual(["Cálculo", "Direito", "Física"]);
  });

  it("[subject/screens#AC-1] shows an empty message when there are no subjects", async () => {
    renderPt(<SubjectsView />);

    expect(await screen.findByText(/Você ainda não tem matérias/)).toBeTruthy();
  });

  it("[subject/screens#AC-2] creates a subject with one push of a new UUIDv7 and the trimmed name", async () => {
    const user = userEvent.setup();
    renderPt(<SubjectsView />);
    await screen.findByText(/Você ainda não tem matérias/);

    await user.type(screen.getByLabelText("Nova matéria"), "  Cálculo  {Enter}");

    await screen.findByText("Cálculo");
    expect(api.pushes).toHaveLength(1);
    const [mutation] = api.pushes;
    expect(mutation).toMatchObject({ entity: "subject", op: "upsert" });
    expect(mutation!.data.name).toBe("Cálculo");
    expect(String(mutation!.data.id)).toMatch(UUID_V7);
    expect(mutation!.mutationId).toMatch(/^[0-9a-f-]{36}$/);
    expect((screen.getByLabelText("Nova matéria") as HTMLInputElement).value).toBe("");
  });

  it.each([
    ["blank", "   ", "Informe o nome da matéria."],
    ["longer than 120 characters", "x".repeat(121), "O nome pode ter até 120 caracteres."],
  ])(
    "[subject/screens#AC-2] refuses a name that is %s, keeps focus and sends nothing",
    async (_n, typed, message) => {
      const user = userEvent.setup();
      renderPt(<SubjectsView />);
      await screen.findByText(/Você ainda não tem matérias/);

      const field = screen.getByLabelText("Nova matéria");
      await user.type(field, `${typed}{Enter}`);

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(document.activeElement).toBe(field);
      expect(api.pushes).toEqual([]);
    },
  );

  it("[subject/screens#AC-3] renames in place with one push of the same id and the trimmed name", async () => {
    api.subjects = [{ id: "s-redes", name: "Redes" }];
    const user = userEvent.setup();
    renderPt(<SubjectsView />);
    await screen.findByText("Redes");

    await user.click(screen.getByRole("button", { name: "Renomear Redes" }));
    const field = screen.getByLabelText("Novo nome de Redes") as HTMLInputElement;
    expect(field.value).toBe("Redes");
    await user.clear(field);
    await user.type(field, "  Redes de Computadores {Enter}");

    await screen.findByText("Redes de Computadores");
    expect(api.pushes).toHaveLength(1);
    expect(api.pushes[0]).toMatchObject({
      entity: "subject",
      op: "upsert",
      data: { id: "s-redes", name: "Redes de Computadores" },
    });
    expect(screen.queryByLabelText(/Novo nome de/)).toBeNull();
  });

  it("[subject/screens#AC-3] cancels a rename with Escape and refuses a blank name", async () => {
    api.subjects = [{ id: "s-redes", name: "Redes" }];
    const user = userEvent.setup();
    renderPt(<SubjectsView />);
    await screen.findByText("Redes");

    await user.click(screen.getByRole("button", { name: "Renomear Redes" }));
    await user.type(screen.getByLabelText("Novo nome de Redes"), "xyz{Escape}");
    expect(screen.queryByLabelText(/Novo nome de/)).toBeNull();
    expect(screen.getByText("Redes")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Renomear Redes" }));
    await user.clear(screen.getByLabelText("Novo nome de Redes"));
    await user.keyboard("{Enter}");

    expect((await screen.findByRole("alert")).textContent).toContain("Informe o nome da matéria.");
    expect(api.pushes).toEqual([]);
  });

  it("[subject/screens#AC-4] deletes with one push and says it went to the trash", async () => {
    api.subjects = [
      { id: "s-redes", name: "Redes" },
      { id: "s-fisica", name: "Física" },
    ];
    const user = userEvent.setup();
    renderPt(<SubjectsView />);
    await screen.findByText("Redes");

    await user.click(screen.getByRole("button", { name: "Apagar Redes" }));

    await waitFor(() => expect(names()).toEqual(["Física"]));
    expect(api.pushes).toHaveLength(1);
    expect(api.pushes[0]).toMatchObject({
      entity: "subject",
      op: "delete",
      data: { id: "s-redes" },
    });
    expect(screen.getByRole("status").textContent).toContain("“Redes” foi para a lixeira.");
  });

  it("[subject/screens#AC-6] keeps the list and what was typed when a mutation is rejected", async () => {
    api.subjects = [{ id: "s-redes", name: "Redes" }];
    const user = userEvent.setup();
    renderPt(<SubjectsView />);
    await screen.findByText("Redes");
    api.rejectNext("NOT_FOUND");

    await user.click(screen.getByRole("button", { name: "Renomear Redes" }));
    const field = screen.getByLabelText("Novo nome de Redes");
    await user.clear(field);
    await user.type(field, "Novo nome{Enter}");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Essa matéria não existe mais.",
    );
    expect((screen.getByLabelText("Novo nome de Redes") as HTMLInputElement).value).toBe(
      "Novo nome",
    );
  });

  it.each([
    [
      "a problem answer RATE_LIMITED",
      problem(429, "RATE_LIMITED", { "retry-after": "20" }),
      "Muitas tentativas. Tente de novo em 20 segundos.",
    ],
    ["an unexpected problem answer", problem(500, "INTERNAL"), "Algo deu errado. Tente de novo."],
    ["a network failure", "network" as const, "Sem conexão com o servidor."],
  ])(
    "[subject/screens#AC-6] shows the message of %s and leaves the list as it was",
    async (_n, answer, message) => {
      api.subjects = [{ id: "s-redes", name: "Redes" }];
      const user = userEvent.setup();
      renderPt(<SubjectsView />);
      await screen.findByText("Redes");
      api.fail("/api/sync/push", answer);

      await user.type(screen.getByLabelText("Nova matéria"), "Cálculo{Enter}");

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(names()).toEqual(["Redes"]);
      expect((screen.getByLabelText("Nova matéria") as HTMLInputElement).value).toBe("Cálculo");
    },
  );

  it("[subject/screens#AC-6] goes to the sign-in screen when the session is gone", async () => {
    const user = userEvent.setup();
    renderPt(<SubjectsView />);
    await screen.findByText(/Você ainda não tem matérias/);
    api.fail("/api/sync/push", problem(401, "UNAUTHENTICATED"));

    await user.type(screen.getByLabelText("Nova matéria"), "Cálculo{Enter}");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it("[subject/screens#AC-6] says the list could not be loaded when the first pull fails", async () => {
    api.fail("/api/sync/pull", "network");
    renderPt(<SubjectsView />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar suas matérias.",
    );
  });

  it("[subject/screens#AC-7] disables the controls while a request is pending and sends it once", async () => {
    const user = userEvent.setup();
    renderPt(<SubjectsView />);
    await screen.findByText(/Você ainda não tem matérias/);
    api.holdNextPush();

    await user.type(screen.getByLabelText("Nova matéria"), "Cálculo{Enter}");
    await user.keyboard("{Enter}");
    const button = screen.getByRole("button", { name: /Criando/ }) as HTMLButtonElement;
    fireEvent.submit(button.closest("form")!);

    expect(button.disabled).toBe(true);
    api.release();
    await screen.findByText("Cálculo");
    expect(api.pushes).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Renomear Cálculo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apagar Cálculo" })).toBeTruthy();
  });
});
