# Grifo — how the app works today (brief for interface design)

This file describes **what exists and works right now**: every screen, every control, the vocabulary, the flows, the keyboard shortcuts and where each piece lives in the code. It exists so a designer, or an LLM used for design (Google Stitch), can understand the app step by step and redesign the interface without breaking how it works.

- Product name in the UI: **Grifo**. UI language: **Brazilian Portuguese (pt-BR)**, always. Every UI text quoted below is the real string.
- Platform: **desktop browsers only** (no mobile layout exists or is required). Keyboard-first.
- Current look: functional prototype. Tailwind CSS, a neutral grey palette, black primary buttons, underlined text links, one narrow centered column (max width 48rem) on most pages, a full-screen layout on the reader. **There is no brand identity, logo, icon set, illustration or custom typography yet** — the whole visual layer is open for design.
- Everything the app does is described under "Screens" and "Flows". What does not exist yet is listed at the end ("Not built yet").

---

## 1. What Grifo is for

A person studying from PDFs (class slides, books, articles) does this:

1. Creates a **subject** (a course, e.g. "Redes de Computadores").
2. **Imports PDFs** into the subject (each PDF becomes a **document**).
3. Opens a document in the **reader** and **highlights** passages, choosing a **category** for each (Tópico, Definição, Exemplo, Importante, …).
4. Every highlight automatically becomes a **node** of the document's **summary** (the "Resumo"): an outline tree. The person reorders and indents it with the keyboard and adds free text.
5. From a node whose role is *Definition*, creates a **flashcard** (front typed by the person, back copied from the passage).
6. **Exports**: the flashcards as an Anki `.apkg` deck (also opens in Noji), and the summary as a PDF.

Nothing the person does is lost by mistake: deleting anything sends it to a **trash** (Lixeira) where it can be restored; items are purged for good only after a retention period.

The person's data is private: every account only ever sees its own subjects, documents, highlights, summaries and flashcards.

---

## 2. Vocabulary (use these words; no synonyms)

| Term (code) | UI word (pt-BR) | Meaning |
| --- | --- | --- |
| Subject | Matéria | A course/topic that groups documents. Has a name (1–120 chars). |
| Document | Documento | One imported PDF inside a subject. Has a title (1–200 chars, defaults to the file name). |
| Highlight | Marcação | A marked passage of a document: page, the rectangles over the text, the quoted text, one category. |
| Category | Categoria | A name + color + **role** + optional shortcut digit 1–9. The palette used to mark text. |
| Role | Papel | What a category means for the summary: **TOPIC** ("Tópico", a heading), **DEFINITION** ("Definição"), **ITEM** ("Item", a bullet), **IGNORE** (marks text without adding it to the summary). |
| Outline / Summary | Resumo | The tree of nodes of one document. |
| Node | Nó / item do resumo | A line of the summary. Either backed by a highlight (shows its quote) or free text typed by the person. |
| Flashcard | Flashcard | Front + back, created from a Definition node. |
| Deck | (baralho) | The set of flashcards of a document or subject, exported as `.apkg`. |
| Trash | Lixeira | Where deleted things wait to be restored. |

Default categories created for every new account (the person can rename/recolor them later; that screen is not built yet):

| Shortcut | Name | Color | Role |
| --- | --- | --- | --- |
| 1 | Tópico | `#4F8EF7` (blue) | TOPIC |
| 2 | Definição | `#F7D04F` (yellow) | DEFINITION |
| 3 | Exemplo | `#5BC17F` (green) | ITEM |
| 4 | Importante | `#F06A6A` (red) | ITEM |

---

## 3. Map of the pages

| Route | Screen | Needs sign-in | Code |
| --- | --- | --- | --- |
| `/signup` | Create account | no | `apps/web/src/app/signup/page.tsx`, `features/auth/` |
| `/login` | Sign in | no | `apps/web/src/app/login/page.tsx`, `features/auth/` |
| `/` | Home = list of subjects | yes | `app/page.tsx`, `features/subjects/` |
| `/subjects/{id}` | One subject = its documents + import | yes | `app/subjects/[id]/page.tsx`, `features/documents/subject-documents-view.tsx` |
| `/documents/{id}` | The reader (PDF + highlights) | yes | `app/documents/[id]/page.tsx`, `features/reader/` |
| `/documents/{id}/summary` | The summary tree | yes | `app/documents/[id]/summary/page.tsx`, `features/outline/` |
| `/documents/{id}/flashcards` | The flashcards of a document | yes | `app/documents/[id]/flashcards/page.tsx`, `features/flashcards/` |
| `/trash` | The trash | yes | `app/trash/page.tsx`, `features/trash/` |

Navigation graph:

```
/signup ⇄ /login → /  (subjects)
                    ├─ /trash
                    └─ /subjects/{id}  (documents of a subject)
                          └─ /documents/{id}  (reader)
                                ├─ /documents/{id}/summary  ⇄  /documents/{id}/flashcards
                                └─ back to /subjects/{id}
```

Without a session every signed-in page redirects to `/login`. A session that expires while using a page sends the person to `/login` too.

All texts live in one file: `apps/web/messages/pt-BR.json` (namespaces: Home, Auth, Subjects, Trash, Documents, Reader, Highlights, Outline, Flashcards, Exports). A redesign must keep UI text in that file, never hard-coded.

---

## 4. The shell (every signed-in page except the reader)

Component: `features/shell/app-shell.tsx`. A centered column (max-width 48rem, 1.5rem padding) with a header row, then the page content:

- Left: **"Grifo"** (text link to `/`, the brand, semibold, large).
- Next to it: nav link **"Lixeira"** (to `/trash`), small, underlined.
- Right: **"Você entrou como {email}."** and a **"Sair"** button (signs out and goes to `/login`).
- A thin bottom border separates the header from the content.

The **reader does not use the shell**: it takes the whole screen (see 7).

---

## 5. Sign up and sign in

**`/signup` — "Criar conta"**: fields *Nome*, *E-mail*, *Senha* (hint: "Use de 10 a 128 caracteres."), button "Criar conta" ("Criando…" while pending), link "Já tem conta? Entrar".
After submitting, the form is replaced by **"Confira seu e-mail"**: "Enviamos um link de confirmação para {email}. Abra o link para ativar a conta." (The message is always the same, even if the email already exists — by design, so nothing reveals which emails exist.)
The confirmation e-mail is a real e-mail; when running locally it is read in Mailpit at `http://localhost:8025`.

**`/login` — "Entrar"**: fields *E-mail*, *Senha*, button "Entrar" ("Entrando…"), link "Ainda não tem conta? Criar conta". After the e-mail link is opened, the person lands here with the banner **"E-mail confirmado. Entre com a sua senha."**

Errors (shown as an alert near the form, the first invalid field takes focus):
"Informe seu nome." · "Informe seu e-mail." · "A senha precisa ter de 10 a 128 caracteres." · "E-mail ou senha incorretos." · "Confirme seu e-mail antes de entrar. Enviamos um link quando você criou a conta." · "Muitas tentativas. Tente de novo em N segundos." · "Algo deu errado. Tente de novo."

Behavior: submit with Enter; the button is disabled while the request is pending; fields have visible labels and correct `autocomplete`.

---

## 6. Home — the subjects (`/`)

Title **"Matérias"**. Content, top to bottom:

1. A one-line form: input labeled **"Nova matéria"** + button **"Criar matéria"** ("Criando…"). Enter in the input also creates. The name is trimmed; blank → "Informe o nome da matéria."; over 120 → "O nome pode ter até 120 caracteres."
2. The list of subjects, **sorted by name (pt-BR order)**. Each row: the name (a link to `/subjects/{id}`), the count ("Nenhum documento" / "1 documento" / "N documentos"), and two actions:
   - **Rename** (aria-label "Renomear {name}"): the name turns into an input in place, current name selected; **Enter saves**, **Escape cancels**; buttons "Salvar"/"Cancelar".
   - **Delete** (aria-label "Apagar {name}"): no confirmation (it is reversible). A notice appears: **"“{name}” foi para a lixeira."**
3. Empty state: "Você ainda não tem matérias. Crie a primeira acima."
4. Loading: "Carregando…". Load failure: "Não foi possível carregar suas matérias." plus the cause.

Errors for the actions: "Essa matéria não existe mais. Atualizamos a lista." · "Sem conexão com o servidor. Verifique sua rede e tente de novo." · rate limit · generic.

Nothing is shown as "done" before the server confirmed it; after each change the list is reloaded from the server.

---

## 7. Subject page — the documents (`/subjects/{id}`)

Code: `features/documents/subject-documents-view.tsx`.

Top to bottom:

- Link **"Voltar às matérias"** and the subject name as the page title.
- **Import block**: a file input labeled **"Importar PDFs"** (multiple files allowed; hint "Escolha um ou mais arquivos PDF de até 100 MiB."). While importing: **"Enviando {current} de {total}: {name}"** (the input is disabled). There is no progress bar and no drag-and-drop yet.
- **Export buttons for the whole subject** (see 11): **"Exportar flashcards (Anki)"** and **"Exportar resumos (PDF)"**.
- **The documents list**, sorted by title. One row per document:
  - **Title** — a link to the reader **only when the document is ready**; otherwise plain text.
  - **Status** text: "Enviando…", "Envio incompleto", "Validando…", "Pronto", or a refusal ("Arquivo recusado." with the reason: "Não é um PDF válido." / "PDF protegido por senha não é aceito." / "Não foi possível validar o arquivo." / "Arquivo bloqueado: vírus detectado.").
  - Only when ready: links **"Resumo"** (→ `/documents/{id}/summary`) and **"Flashcards"** (→ `/documents/{id}/flashcards`), and the page count ("12 páginas").
  - **Rename** (aria-label "Renomear {title}"; Enter saves, Escape cancels) and **Delete** (aria-label "Apagar {title}"; notice "“{title}” foi para a lixeira.").
- The page polls the server every ~2 s while any document is still being processed, so the status changes by itself ("Validando…" → "Pronto").
- Empty: "Esta matéria ainda não tem documentos. Importe um PDF acima."

**Lifecycle of an uploaded document** (the states a designer will see): Enviando… (bytes going to storage) → Validando… (background job checks it is a real, unencrypted PDF and counts pages; a virus scan runs after) → **Pronto**, or **recusado** (invalid/encrypted/bloqueado). Importing the same file twice creates a second document.

Import errors (per file): "“{name}” passa de 100 MiB." · "“{name}” não é um PDF." · "O envio de “{name}” falhou." · "O arquivo não chegou inteiro. Importe de novo." · conflict, rate-limit, network, generic.

---

## 8. The reader (`/documents/{id}`) — the main screen

Code: `features/reader/` (`document-reader.tsx` is the page; `embedpdf-surface.tsx` is the PDF engine adapter; `categories-bar.tsx`; `selection-menu.tsx`; `highlights-panel.tsx`; `highlights-client.ts`; `geometry.ts`).
The PDF is rendered in the browser by the EmbedPDF engine (PDFium compiled to WebAssembly, running in a Web Worker). The original file is never modified. PDF JavaScript/actions never run.

**Layout — full viewport height, three horizontal bands plus a side panel:**

1. **Top bar** (a toolbar): link **"Voltar à matéria"** · the **document title** (bold, truncated, takes the free space) · link **"Resumo"** · page controls: **‹** (aria "Página anterior") · a number input (aria "Ir para a página") with **"Página X de N"** beside it · **›** (aria "Próxima página") · zoom controls: **−** ("Diminuir zoom"), the zoom **percentage**, **+** ("Aumentar zoom"), and **"Ajustar à largura"**.
2. **Categories bar** (just under the top bar): one chip per category — **color dot, name and the shortcut digit** (e.g. "● Tópico 1").
3. **Document area** (fills the rest, scrolls vertically): the pages stacked, the PDF text selectable. Highlights are drawn over the text as **translucent rectangles in the category color**, aligned at any zoom.
4. **Right side panel "Marcações"** (fixed width ≈ 18rem, scrolls): the list of the document's highlights.

**How marking works (the core interaction):**
- The person **selects text with the mouse**. A small **menu "Marcar seleção"** appears next to the selection listing the categories (dot, name, digit).
- **Choose a category by clicking it or by pressing its digit (1–9)**. The highlight is created and drawn; the selection clears. A selection that spans two pages creates one highlight per page.
- **Escape** clears the selection and closes the menu. A digit with no selection, inside a text field, or with no category on that digit does nothing.

**The "Marcações" panel**: sorted by page, then top to bottom. Each item: a color dot, the **quote** (cut at 120 chars), "Página N". Click → the reader scrolls to that page. Each item also has a **category selector** (aria "Categoria de {quote}") to recolor it, and a **delete** button (aria "Apagar marcação: {quote}") → notice "Marcação enviada para a lixeira." Empty: "Nenhuma marcação neste documento ainda."

**Keyboard in the reader:** `+` zoom in, `-` zoom out, `0` fit width (not while typing in a field); PageUp/PageDown/Home/End/arrows scroll the document area; type a page number in the page input and press Enter to jump (a number outside 1..N shows "Digite uma página de 1 a {total}." and does not move).

**States:** "Carregando documento…"; "Documento não encontrado."; "Este documento ainda está sendo preparado."; "Este documento foi recusado e não pode ser aberto."; "Este documento foi bloqueado e não pode ser aberto."; "Não foi possível abrir o documento." — each with a link back.

---

## 9. The summary (`/documents/{id}/summary`)

Code: `features/outline/outline-view.tsx`, `outline-tree.ts` (pure tree operations), `outline-client.ts`.

Page title **"Resumo: {document title}"**. Header: link "Voltar ao documento", a link **"Flashcards"**, the key help line, and the button **"Exportar resumo (PDF)"**.

The key help line (always shown): *"Teclas: ↑ e ↓ selecionam, Tab e Shift+Tab mudam o nível, Alt+↑ e Alt+↓ movem, Delete remove, Enter edita."*

**The tree** (one focusable list; each line is a "node"):
- A node shows, by **role**:
  - **Topic** → a bold heading; heading level = number of topic ancestors + 1.
  - **Definition** → a small yellow tag **"Definição"** followed by the text.
  - **Item** → a bullet • followed by the text.
- Nodes backed by a highlight show a **color dot** (the category color) and the quoted text (or the person's override text). Free-text nodes have no dot.
- Indentation shows depth (≈1.25rem per level). The selected node has a light grey background.
- Every Definition node (own role or its category's) also has the actions **"Criar flashcard"** and, if it already has cards, a link **"N flashcards"** (to the flashcards page).

**Keyboard (the main way to work):**
| Key | Does |
| --- | --- |
| ↑ / ↓ | Select previous / next node |
| Tab | Indent: becomes the last child of the previous sibling |
| Shift+Tab | Outdent: becomes the next sibling of its parent |
| Alt+↑ / Alt+↓ | Move among siblings |
| Enter or F2 | Edit the node in place (text + role) |
| Delete / Backspace | Remove (goes to the trash; children move up) |
| C | Open "create flashcard" for a selected Definition node |

**Edit in place:** a text input + a role selector ("Tópico", "Definição", "Item"; for highlight nodes also "Igual à categoria") + "Salvar" / "Cancelar". Escape cancels. A free-text node needs text and a role ("Informe o texto do nó.").

**Add free text** (form under the tree): role selector ("Papel do novo nó"), text input ("Texto do novo nó"), button **"Adicionar"**. The new node is placed after the selected one.

**Create flashcard** (inline under the node): input **"Frente do flashcard"** + button "Criar" + "Cancelar". Enter creates; Escape cancels; blank → "Informe a frente do flashcard." The back is copied from the node's text by the server. Afterwards the node shows "1 flashcard".

**States/errors:** "Carregando…"; "Documento não encontrado."; "Este documento ainda está sendo preparado."; empty: "O resumo deste documento está vazio. Marque trechos no leitor ou adicione um texto abaixo."; errors for cycle ("Esse movimento criaria um ciclo no resumo."), deleted parent, not found, network, rate limit, generic.

Not built: dragging nodes with the mouse (only the keyboard moves nodes).

**Automatic behavior to design around:** when a highlight is created in the reader, its node appears in the summary on its own (appended among the root nodes in page order); deleting a highlight removes its node; changing a highlight's category changes the node's role (unless the person overrode it).

---

## 10. Flashcards page (`/documents/{id}/flashcards`)

Code: `features/flashcards/flashcards-view.tsx`, `flashcards-client.ts`.

Title **"Flashcards: {document title}"**. Header: link "Voltar ao documento", link "Ir para o resumo", button **"Exportar para Anki"**.

The list (sorted by front, pt-BR) of bordered cards. Each card shows the **front** (bold) and the **back** (the passage), and three text actions:
- **"Editar"** (aria "Editar {front}") → front input ("Frente do flashcard") + back textarea ("Verso do flashcard") + "Salvar"/"Cancelar" (Escape cancels). Both fields must be non-empty.
- **"Atualizar pelo resumo"** (aria "Atualizar pelo resumo: {front}") → re-copies the back from the summary node (use after the node text changed). If the node was deleted: "O item do resumo desse flashcard foi apagado."
- **"Apagar"** → notice "“{front}” foi para a lixeira."

Empty: "Este documento ainda não tem flashcards. Crie um a partir de uma definição do resumo." There is **no study/review mode** in Grifo: studying happens in Anki (or Noji) after exporting.

---

## 11. Exports

A reusable button (`features/exports/export-button.tsx`) used in four places:

| Where | Button | Result |
| --- | --- | --- |
| Flashcards page | "Exportar para Anki" | `.apkg` of that document's flashcards |
| Subject page | "Exportar flashcards (Anki)" | `.apkg` of all documents of the subject (one Anki sub-deck per document) |
| Summary page | "Exportar resumo (PDF)" | PDF of that document's summary |
| Subject page | "Exportar resumos (PDF)" | one PDF with every document's summary, one section per document |

Behavior: click → the button becomes disabled and reads **"Gerando…"**, with a status line **"Gerando o arquivo. Isso leva alguns segundos."**; when ready the **browser downloads the file** (named after the document or subject). Errors appear under the button: "Não foi possível gerar o arquivo. Tente de novo." · "Esse item não existe mais." · rate limit · network · generic; the button is enabled again.

**Anki package contents:** one note per flashcard (fields Frente/Verso/Fonte; Fonte = "Matéria › Documento, p. N"), deck `Matéria::Documento`, tags: subject, document, `page_N`. Re-exporting after edits updates the same notes in Anki instead of duplicating them.
**Summary PDF layout (template "classic", versioned):** A4; document title as the main heading; topics as headings; definitions as blocks with a colored left bar and the page ("p. 3"); items as indented bullets; each document starts a page; footer with the document (or subject) name and page numbers. This PDF layout is generated by a template in code (`packages/modules/export/src/templates/classic.ts`) — **its visual design is also open**.

---

## 12. Trash (`/trash`)

Title "Lixeira"; link "Voltar às matérias". A list, newest first. Each row: the name/title, the **kind** (Matéria, Documento, Categoria, Marcação, Tópico do resumo, Flashcard, Exportação), "Apagado em {date}", and a button **"Restaurar {label}"**. Empty: "A lixeira está vazia."
Rule: deleting a subject sends its documents (and their highlights, nodes, flashcards) with it, and **restoring the subject restores them together**. To restore an item whose parent is deleted, the parent must be restored first ("Restaure primeiro o item ao qual este pertence.").

---

## 13. Cross-cutting behavior a design must respect

- **Keyboard first:** every action has a keyboard path; every control has an accessible name; visible focus is required.
- **Feedback rules:** the UI never claims something changed before the server confirmed it; after a change the screen reloads the data. Failures show a message chosen by error type, in an element with `role="alert"` (success notices use `role="status"`).
- **Pending buttons are disabled** (no double submit).
- **Delete has no confirmation dialogs** — instead, a notice says "foi para a lixeira" and the trash restores it.
- **Messages never reveal** whether an e-mail exists.
- **Loading states** are plain text ("Carregando…").
- All error messages above exist in pt-BR already; a redesign changes presentation, not wording, unless the wording is changed in `messages/pt-BR.json`.

## 14. Data model in one paragraph (to explain what the screens manipulate)

`Subject` 1—N `Document`; `Document` 1—N `Highlight` (each with one `Category`), 1—N `OutlineNode` (a node optionally points to one highlight), 1—N `Flashcard` (each points to the node it came from). `Category` belongs to the person, not to a document, and is shared by all documents. IDs are UUIDv7 created in the browser. Every change is sent as a mutation to the server (`POST /api/sync/push`) and the screens read everything with `GET /api/sync/pull`; there is no offline mode yet.

---

## 15. Not built yet (do not design as if it existed — or design it as "coming")

- **Categories management screen** (create, rename, recolor, reorder, set role/shortcut). Today only the four default categories exist and are used.
- **Forgot-password flow, resend confirmation e-mail, delete-account screen.**
- **Annotated PDF export** (the original PDF with the highlights embedded) and the full-data export.
- **Study mode** inside Grifo (reviewing flashcards); studying is done in Anki/Noji.
- **Offline use** and a "saved on this device / synced" indicator (the app needs the server).
- **Drag and drop** (importing PDFs, moving summary nodes).
- Upload **progress bar**; the **page the person was reading is not remembered**.
- Notes on a highlight (the data field exists; no screen).
- Search, tags, themes (dark mode), settings page, onboarding, multi-language (single locale pt-BR).
- Real-time progress for exports (the page polls every second instead).

---

## 16. Where things live (for whoever turns a design into code)

```
apps/web/                       Next.js app (UI + HTTP API)
  messages/pt-BR.json           every UI string
  src/app/                      routes (pages) and src/app/api/** (HTTP endpoints)
  src/features/<name>/          one folder per area: auth, subjects, documents, reader,
                                outline, flashcards, exports, trash, shell
  src/lib/api.ts                the small client used by every screen (request, pullAll, pushMutation…)
  src/test/                     test doubles (fake API, fake PDF surface)
apps/worker/                    background jobs (PDF validation, virus scan, exports, e-mail, purge)
apps/e2e/                       Playwright tests that drive the real app in a browser
packages/modules/<module>/      the business rules: identity, library, annotation, outline, study, export
docs/specs/                     the written behavior of every screen and entity (source of truth)
docs/adr/                       the architecture decisions (why)
```
Styling is Tailwind CSS utility classes written directly in the components (no component library, no design tokens yet) — introducing a design system means introducing tokens (colors, type scale, spacing, radius) and replacing those classes feature by feature.

To run it locally: `docker compose --profile app up -d --build`, then open `http://localhost:3000` (sign-up e-mails arrive at `http://localhost:8025`).
