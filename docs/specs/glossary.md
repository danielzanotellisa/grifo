# Glossary

Code uses the English name; the UI uses the pt-BR term. No synonyms in code or specs.

| UI (pt-BR) | Code | Definition |
| --- | --- | --- |
| Usuário | `User` | Owner of all data. |
| Matéria | `Subject` | A user's group of documents. |
| Documento | `Document` | An imported PDF, in exactly one subject. Never modified. |
| Arquivo | `StoredFile` | The PDF bytes in storage, content-addressed by SHA-256 per owner. |
| Marcação | `Highlight` | A marked passage: page, rects (PDF points), text quote, category. |
| Categoria | `Category` | User-defined name + color, pointing to one role. |
| Papel | `OutlineRole` | Fixed behavior: `TOPIC`, `DEFINITION`, `ITEM`, `IGNORE`. |
| Resumo (estrutura) | `Outline` | The tree of nodes of one document. |
| Nó de resumo | `OutlineNode` | Element of the outline: from a highlight or free text. |
| Flashcard | `Flashcard` | Study card made from a `DEFINITION` node. |
| Deck | `Deck` | Flashcards of a document or a subject. A projection, not stored. |
| Exportação | `Export` | A generated file: summary PDF, annotated PDF, flashcard deck (.apkg), full data. |
| Modelo de resumo | `SummaryTemplate` | Versioned layout used to render an outline as PDF. |
| Lixeira | Trash | Soft-deleted items, restorable for 30 days. |

Avoid: Annotation (for Highlight), Course (for Subject), Card (for Flashcard), Summary (for the tree — "summary" is the rendered PDF).
