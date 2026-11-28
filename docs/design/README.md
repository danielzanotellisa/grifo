# Design — Grifo Editorial

The visual source of truth of the front end (ADR 0043).

- `DESIGN.md` — the tokens (colors, type, radii, spacing) and the rules of the system, as exported from Google Stitch. The app implements them as Tailwind theme variables in `apps/web/src/app/globals.css`.
- `stitch/<screen>/screen.png` and `code.html` — the eight screens Stitch made: sign-in, sign-up, subjects, one subject, the reader, the summary, the flashcards and the trash. They are references for layout; `code.html` uses the Tailwind CDN and an icon font, so it is not code to copy.

## How the conflicts were settled
| Point | Choice |
| --- | --- |
| Background, borders, ink | `#fef9f0`, `#e3dcd1`, `#2d2b28` |
| Radii | 4 px for fields and buttons, 8 px for flashcards, popovers and cards |
| Shadows | none, except the hairline ones of `DESIGN.md` |
| Flashcard | front in the serif, back in the sans |
| Panel of the reader | 18 rem |
| Indent of the summary | 1.25 rem per level |
| Category colors | the ones stored with the category (user data), never the `mark-*` tokens |

## What the screens show that the app does not do
Not built, because there is no data or behavior behind it: a semester, a subject code ("MAT-402"), "indexing" and "extracting the topic tree", "last read" and "last modified" times, the status chip of the engine, Markdown in a flashcard, pagination of the flashcards, a "Replace" action for a refused document.

## Screens the design does not have
Categories, account, forgot password, reset password, the warning for a PDF with no selectable text, the export button states and the annotated PDF button. They are drawn from the same tokens.
