# 0043. The "Grifo Editorial" design system

- Status: accepted
- Date: 2026-11-28
- Amends: 0041
- Related: 0001, 0013

## Context
The first screens were built with neutral Tailwind classes. The design of the whole front end was made in Google Stitch (`docs/design/`): a warm-paper, editorial look with a serif for titles and quotes, a sans for the interface and a monospace for keys. It comes as tokens and prose (`DESIGN.md`), eight screens (`stitch/*/screen.png` and `code.html`) and a blueprint that contradicts the tokens in places (background, borders, radii, shadows, the fonts of the flashcard, the width of the panel). The screens also show things the app does not do (a semester, a "MAT-402" code, "indexing", a last-modified time, a Markdown flashcard, pagination).

## Decision
1. **The look is `docs/design/DESIGN.md`.** Where the blueprint or a screen disagrees with it, the tokens win; the screens are references for layout and spacing, not a spec of content. Content that the app cannot back with real data is not built.
2. **Tokens are Tailwind 4 theme variables** in `apps/web/src/app/globals.css` (`@theme`), named after their role (`surface`, `ink`, `hairline`…), and components use them; no hex literal in a class. Page background `#fef9f0`, hairline `#e3dcd1`, ink `#2d2b28`, radii 4 px and 8 px, no shadows except the two hairline ones of the design.
3. **Fonts** come from `next/font/google` (Newsreader, Inter, JetBrains Mono), self-hosted by Next at build time, exposed as `font-serif`, `font-sans` and `font-mono`. Serif is for titles, quotes and the front of a flashcard; sans for the interface and the back; mono for keys, pages and counters.
4. **Icons** are inline SVG components in `apps/web/src/components/icons.tsx`: no icon font and no network request at runtime.
5. **Category colors stay user data.** The highlight overlay, the dots and the tint of a summary node are computed from `category.color` (an alpha of about 20 to 25 %), never from fixed per-category classes. The `mark-*` tokens of the design are not used.
6. **Texts keep their keys.** The wording already used by specs and tests does not change; new texts of the design enter `messages/pt-BR.json` only when they say something true.
7. **Accessibility is kept**: the accessible names of controls, roles and the keyboard model do not change with the look; secondary text and placeholders are chosen for 4.5:1 contrast, and the smallest sizes are 12 px.

## Considered options
- **Hex values in the classes, as the blueprint does.** Fast, but a change of palette becomes a search and replace.
- **An icon font (Material Symbols) from the CDN.** The design uses it, but it needs the network, which the local run does not require.
- **A component library.** Still open (`P-009`); the design is simple enough for plain components.

## Consequences
Every screen is restyled in slices with no change of behavior; the end-to-end test that read a highlight color from the page changes with the alpha. `docs/design/` is the visual source of truth and is kept in step with the tokens.
