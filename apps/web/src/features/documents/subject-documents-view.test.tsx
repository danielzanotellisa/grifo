import { createHash } from "node:crypto";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "../../test/fake-api";
import { problem, renderPt } from "../../test/render";
import { SubjectsView } from "../subjects/subjects-view";
import { SubjectDocumentsView } from "./subject-documents-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const POLL_MS = 15;
let api: FakeApi;
beforeEach(() => {
  api = new FakeApi();
  api.subjects = [
    { id: "s-redes", name: "Redes" },
    { id: "s-outra", name: "Outra" },
  ];
  push.mockReset();
  vi.stubGlobal("fetch", api.fetch);
});

const view = () => renderPt(<SubjectDocumentsView subjectId="s-redes" pollMs={POLL_MS} />);
const titles = () =>
  screen.queryAllByRole("listitem").map((i) => i.querySelector("[data-title]")?.textContent);
const bytesOf = (text: string) => new TextEncoder().encode(text);
const pdf = (name: string, text = "%PDF-1.4 conteudo", type = "application/pdf") =>
  new File([bytesOf(text)], name, { type });
const sha256 = (text: string) => createHash("sha256").update(bytesOf(text)).digest("hex");
const importFiles = (user: ReturnType<typeof userEvent.setup>, ...files: File[]) =>
  user.upload(screen.getByLabelText("Importar PDFs"), files);
const item = (title: string) => screen.getByText(title).closest("li")!;

describe("subject page: the list", () => {
  it("[document/screens#AC-1] lists only the live documents of the subject, by title, with status and pages", async () => {
    api.documents = [
      { id: "d1", subjectId: "s-redes", title: "Camada de rede", status: "READY", pageCount: 12 },
      { id: "d2", subjectId: "s-redes", title: "Aula 1", status: "READY", pageCount: 1 },
      {
        id: "d3",
        subjectId: "s-redes",
        title: "Em validação",
        status: "VALIDATING",
        pageCount: null,
      },
      { id: "d4", subjectId: "s-outra", title: "De outra matéria", status: "READY" },
    ];
    view();

    await screen.findByText("Aula 1");

    expect(titles()).toEqual(["Aula 1", "Camada de rede", "Em validação"]);
    expect(within(item("Aula 1")).getByText("Pronto")).toBeTruthy();
    expect(within(item("Aula 1")).getByText("1 página")).toBeTruthy();
    expect(within(item("Camada de rede")).getByText("12 páginas")).toBeTruthy();
    expect(within(item("Em validação")).getByText("Validando…")).toBeTruthy();
  });

  it("[document/screens#AC-1] shows an empty message and the name of the subject", async () => {
    view();

    expect(await screen.findByText(/Esta matéria ainda não tem documentos/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Redes" })).toBeTruthy();
  });

  it.each([
    ["missing", () => undefined],
    ["deleted", () => (api.subjects = api.subjects.filter((s) => s.id !== "s-redes"))],
  ])(
    "[document/screens#AC-1] says the subject was not found when it is %s",
    async (_n, prepare) => {
      prepare();
      api.subjects = api.subjects.filter((s) => s.id !== "s-redes");
      view();

      expect(await screen.findByText("Matéria não encontrada.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Voltar às matérias" }).getAttribute("href")).toBe(
        "/",
      );
    },
  );

  it("[document/screens#AC-1] makes the name of each subject on the home a link to its page", async () => {
    renderPt(<SubjectsView />);

    const link = await screen.findByRole("link", { name: "Redes" });

    expect(link.getAttribute("href")).toBe("/subjects/s-redes");
  });
});

describe("subject page: importing", () => {
  it("[document/screens#AC-2] starts, sends the file to the storage and confirms, then lists the document", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);

    await importFiles(user, pdf("  Aula 1.PDF ", "%PDF-1.4 abc"));

    await screen.findByText("Aula 1");
    expect(api.starts).toHaveLength(1);
    expect(api.starts[0]).toMatchObject({
      subjectId: "s-redes",
      title: "Aula 1",
      sha256: sha256("%PDF-1.4 abc"),
      sizeBytes: 12,
    });
    expect(String(api.starts[0]!.documentId)).toMatch(UUID_V7);
    expect(api.puts).toHaveLength(1);
    expect(api.puts[0]).toMatchObject({
      url: `http://storage.test/put/${api.starts[0]!.documentId}`,
      bytes: 12,
    });
    expect(api.puts[0]!.headers).toEqual({
      "content-type": "application/pdf",
      "x-amz-checksum-sha256": "abc",
    });
    expect(api.confirms).toEqual([api.starts[0]!.documentId]);
  });

  it("[document/screens#AC-2] cuts a title taken from a very long file name to 200 characters", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);

    await importFiles(user, pdf(`${"a".repeat(250)}.pdf`));

    await waitFor(() => expect(api.starts).toHaveLength(1));
    expect(String(api.starts[0]!.title)).toBe("a".repeat(200));
  });

  it("[document/screens#AC-2] sends nothing to the storage when the server already has the bytes", async () => {
    api.storedHashes.add(sha256("%PDF-1.4 igual"));
    const user = userEvent.setup();
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);

    await importFiles(user, pdf("Repetido.pdf", "%PDF-1.4 igual"));

    await screen.findByText("Repetido");
    expect(api.puts).toEqual([]);
    expect(api.confirms).toHaveLength(1);
  });

  it("[document/screens#AC-2] handles several files one after the other", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);
    api.holdNextPut();

    await importFiles(
      user,
      pdf("Primeiro.pdf", "%PDF-1.4 um"),
      pdf("Segundo.pdf", "%PDF-1.4 dois"),
    );
    await waitFor(() => expect(api.puts).toHaveLength(1));
    expect(api.starts).toHaveLength(1);
    api.releasePut();

    await screen.findByText("Segundo");
    expect(api.starts.map((s) => s.title)).toEqual(["Primeiro", "Segundo"]);
    expect(api.confirms).toHaveLength(2);
  });
});

describe("subject page: following the status", () => {
  const pending = (status = "VALIDATING") => {
    api.documents = [{ id: "d1", subjectId: "s-redes", title: "Aula 1", status, pageCount: null }];
  };

  it("[document/screens#AC-3] shows the page count when the validation ends", async () => {
    pending();
    view();
    await screen.findByText("Validando…");

    api.finish("d1", { status: "READY", pageCount: 3 });

    await screen.findByText("Pronto");
    expect(screen.getByText("3 páginas")).toBeTruthy();
  });

  it.each([
    ["REJECTED", "PDF_INVALID", "Não é um PDF válido."],
    ["REJECTED", "PDF_ENCRYPTED", "PDF protegido por senha não é aceito."],
    ["REJECTED", "VALIDATION_FAILED", "Não foi possível validar o arquivo."],
    ["QUARANTINED", "MALWARE_DETECTED", "Arquivo bloqueado: vírus detectado."],
  ])(
    "[document/screens#AC-3] says why a document is %s with %s",
    async (status, rejectCode, message) => {
      pending();
      view();
      await screen.findByText("Validando…");

      api.finish("d1", { status, rejectCode });

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByText("Validando…")).toBeNull();
    },
  );

  it("[document/screens#AC-3] stops pulling once nothing is pending", async () => {
    pending();
    view();
    await screen.findByText("Validando…");
    api.finish("d1", { status: "READY", pageCount: 2 });
    await screen.findByText("Pronto");

    const pullsWhenDone = api.pulls;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 6));

    expect(api.pulls).toBe(pullsWhenDone);
  });

  it("[document/screens#AC-3] stops pulling when the page is left", async () => {
    pending();
    const { unmount } = view();
    await screen.findByText("Validando…");
    unmount();

    const pullsWhenLeft = api.pulls;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 6));

    expect(api.pulls).toBe(pullsWhenLeft);
  });

  it("[document/screens#AC-3] keeps the list when a pull fails and tries again at the next tick", async () => {
    pending();
    view();
    await screen.findByText("Validando…");
    api.fail("/api/sync/pull", "network");
    api.finish("d1", { status: "READY", pageCount: 5 });

    await screen.findByText("Pronto");

    expect(titles()).toEqual(["Aula 1"]);
  });
});

describe("subject page: refusing and failing", () => {
  it("[document/screens#AC-4] refuses a file over 100 MiB and one that is not a PDF, and still sends the others", async () => {
    // A person can pick "all files" in the dialog, which bypasses the accept attribute.
    const user = userEvent.setup({ applyAccept: false });
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);
    const huge = pdf("Enorme.pdf");
    Object.defineProperty(huge, "size", { value: 100 * 1024 * 1024 + 1 });

    await importFiles(
      user,
      huge,
      pdf("notas.txt", "texto", "text/plain"),
      pdf("Bom.pdf", "%PDF-1.4 bom"),
    );

    await screen.findByText("Bom");
    const alert = screen.getByRole("alert").textContent!;
    expect(alert).toContain("“Enorme.pdf” passa de 100 MiB.");
    expect(alert).toContain("“notas.txt” não é um PDF.");
    expect(api.starts.map((s) => s.title)).toEqual(["Bom"]);
  });

  it.each([
    ["PARENT_DELETED", problem(422, "PARENT_DELETED"), "Esta matéria não existe mais."],
    [
      "UPLOAD_CONFLICT",
      problem(409, "UPLOAD_CONFLICT"),
      "Este envio entrou em conflito com outro. Tente de novo.",
    ],
    [
      "RATE_LIMITED",
      problem(429, "RATE_LIMITED", { "retry-after": "9" }),
      "Muitas tentativas. Tente de novo em 9 segundos.",
    ],
    ["a network failure", "network" as const, "Sem conexão com o servidor."],
  ])(
    "[document/screens#AC-5] shows the message of %s from the start and goes on with the next file",
    async (_n, answer, message) => {
      const user = userEvent.setup();
      view();
      await screen.findByText(/Esta matéria ainda não tem documentos/);
      api.fail("/api/documents/uploads", answer);

      await importFiles(user, pdf("Falha.pdf", "%PDF-1.4 a"), pdf("Segue.pdf", "%PDF-1.4 b"));

      await screen.findByText("Segue");
      expect(screen.getByRole("alert").textContent).toContain(message);
      expect(titles()).toEqual(["Segue"]);
    },
  );

  it("[document/screens#AC-5] keeps a document whose storage upload failed as incomplete, deletable, and goes on", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);
    api.fail("/put", problem(500, "INTERNAL"));

    await importFiles(user, pdf("Quebrado.pdf", "%PDF-1.4 a"), pdf("Segue.pdf", "%PDF-1.4 b"));

    await screen.findByText("Segue");
    expect(screen.getByRole("alert").textContent).toContain("O envio de “Quebrado.pdf” falhou.");
    expect(within(item("Quebrado")).getByText("Envio incompleto")).toBeTruthy();
    expect(api.confirms).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Apagar Quebrado" }));
    await waitFor(() => expect(titles()).toEqual(["Segue"]));
  });

  it("[document/screens#AC-5] shows the message when the confirm says the file did not arrive whole", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);
    api.fail("/api/documents/", problem(409, "UPLOAD_INCOMPLETE"));

    await importFiles(user, pdf("Parcial.pdf", "%PDF-1.4 a"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "O arquivo não chegou inteiro. Importe de novo.",
    );
  });

  it("[document/screens#AC-5] goes to the sign-in screen when the session is gone", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);
    api.fail("/api/documents/uploads", problem(401, "UNAUTHENTICATED"));

    await importFiles(user, pdf("Sessao.pdf"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});

describe("subject page: rename and delete", () => {
  beforeEach(() => {
    api.documents = [
      { id: "d1", subjectId: "s-redes", title: "Aula 1", status: "READY", pageCount: 4 },
    ];
  });

  it("[document/screens#AC-6] renames in place with one push of the same id and subject and the trimmed title", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText("Aula 1");

    await user.click(screen.getByRole("button", { name: "Renomear Aula 1" }));
    const field = screen.getByLabelText("Novo título de Aula 1") as HTMLInputElement;
    expect(field.value).toBe("Aula 1");
    await user.clear(field);
    await user.type(field, "  Aula 1 - TCP {Enter}");

    await screen.findByText("Aula 1 - TCP");
    expect(api.pushes).toHaveLength(1);
    expect(api.pushes[0]).toMatchObject({
      entity: "document",
      op: "upsert",
      data: { id: "d1", subjectId: "s-redes", title: "Aula 1 - TCP" },
    });
  });

  it("[document/screens#AC-7] sends a rename once even if the form is submitted twice before the answer", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText("Aula 1");
    await user.click(screen.getByRole("button", { name: "Renomear Aula 1" }));
    const field = screen.getByLabelText("Novo título de Aula 1");
    await user.clear(field);
    await user.type(field, "Aula 1 - TCP");
    api.holdNextPush();

    const form = field.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    api.release();

    await screen.findByText("Aula 1 - TCP");
    expect(api.pushes).toHaveLength(1);
  });

  it.each([
    ["blank", "   ", "Informe o título do documento."],
    ["longer than 200 characters", "x".repeat(201), "O título pode ter até 200 caracteres."],
  ])(
    "[document/screens#AC-6] refuses a title that is %s and cancels with Escape",
    async (_n, typed, message) => {
      const user = userEvent.setup();
      view();
      await screen.findByText("Aula 1");

      await user.click(screen.getByRole("button", { name: "Renomear Aula 1" }));
      const field = screen.getByLabelText("Novo título de Aula 1");
      await user.clear(field);
      await user.type(field, `${typed}{Enter}`);

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(api.pushes).toEqual([]);
      await user.keyboard("{Escape}");
      expect(screen.queryByLabelText(/Novo título de/)).toBeNull();
      expect(screen.getByText("Aula 1")).toBeTruthy();
    },
  );

  it("[document/screens#AC-6] deletes with one push and says it went to the trash", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText("Aula 1");

    await user.click(screen.getByRole("button", { name: "Apagar Aula 1" }));

    await screen.findByText(/Esta matéria ainda não tem documentos/);
    expect(api.pushes).toHaveLength(1);
    expect(api.pushes[0]).toMatchObject({ entity: "document", op: "delete", data: { id: "d1" } });
    expect(screen.getByRole("status").textContent).toContain("“Aula 1” foi para a lixeira.");
  });
});

describe("subject page: the import control", () => {
  it("[document/screens#AC-7] is a labelled input that accepts PDFs and several files", async () => {
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);

    const input = screen.getByLabelText("Importar PDFs") as HTMLInputElement;

    expect(input.type).toBe("file");
    expect(input.accept).toBe("application/pdf");
    expect(input.multiple).toBe(true);
  });

  it("[document/screens#AC-7] is disabled while a file is being handled, so a second choice sends nothing", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText(/Esta matéria ainda não tem documentos/);
    api.holdNextPut();

    await importFiles(user, pdf("Um.pdf", "%PDF-1.4 um"));
    await waitFor(() => expect(api.puts).toHaveLength(1));
    const input = screen.getByLabelText("Importar PDFs") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf("Dois.pdf", "%PDF-1.4 dois")] } });

    expect(input.disabled).toBe(true);
    api.releasePut();
    await waitFor(() => expect(input.disabled).toBe(false));
    expect(api.starts.map((s) => s.title)).toEqual(["Um"]);
  });
});

describe("subject page: opening a document", () => {
  it("[document/reader#AC-7] links the title of a READY document to its reader and no other", async () => {
    api.documents = [
      { id: "d1", subjectId: "s-redes", title: "Aula pronta", status: "READY", pageCount: 3 },
      { id: "d2", subjectId: "s-redes", title: "Validando", status: "VALIDATING" },
      {
        id: "d3",
        subjectId: "s-redes",
        title: "Recusado",
        status: "REJECTED",
        rejectCode: "PDF_INVALID",
      },
      {
        id: "d4",
        subjectId: "s-redes",
        title: "Bloqueado",
        status: "QUARANTINED",
        rejectCode: "MALWARE_DETECTED",
      },
    ];
    view();
    await screen.findByText("Aula pronta");

    expect(screen.getByRole("link", { name: "Aula pronta" }).getAttribute("href")).toBe(
      "/documents/d1",
    );
    expect(screen.queryByRole("link", { name: "Validando" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Recusado" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Bloqueado" })).toBeNull();
  });
});

describe("subject page: the summary link", () => {
  it("[outline-node/screens#AC-10] links the summary of every READY document and of no other", async () => {
    api.documents = [
      { id: "d1", subjectId: "s-redes", title: "Aula pronta", status: "READY", pageCount: 3 },
      { id: "d2", subjectId: "s-redes", title: "Aula em validação", status: "VALIDATING" },
      {
        id: "d3",
        subjectId: "s-redes",
        title: "Aula recusada",
        status: "REJECTED",
        rejectCode: "PDF_INVALID",
      },
    ];
    view();
    await screen.findByText("Validando…");

    expect(
      screen.getAllByRole("link", { name: "Resumo" }).map((l) => l.getAttribute("href")),
    ).toEqual(["/documents/d1/summary"]);
    expect(within(item("Aula pronta")).getByRole("link", { name: "Resumo" })).toBeTruthy();
    expect(within(item("Aula em validação")).queryByRole("link", { name: "Resumo" })).toBeNull();
  });
});
