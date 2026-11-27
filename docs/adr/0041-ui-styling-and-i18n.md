# 0041. UI styling with Tailwind CSS and texts with next-intl

- Status: accepted
- Date: 2026-11-27
- Related: 0001, 0012, 0022

## Context
`P-009` blocked the first screens on two choices: how to style the UI and how to keep its texts out of the code (pt-BR by default, keys from day one). Component primitives for menus, dialogs and the outliner are a separate, still open point.

## Decision
1. **Styling: Tailwind CSS 4** (`tailwindcss` and `@tailwindcss/postcss`, MIT), in `apps/web` only, through `postcss.config.mjs` and `src/app/globals.css`. Utility classes in the components; no CSS-in-JS.
2. **Texts: next-intl** (MIT) without locale routing: one locale, `pt-BR`, fixed in `src/i18n/request.ts`, messages in `apps/web/messages/pt-BR.json`. Server components use `getTranslations`, client components `useTranslations` under the `NextIntlClientProvider` of the root layout. A new locale later means a new messages file and a locale source, not a rewrite.
3. **Versions.** Exact: `tailwindcss` and `@tailwindcss/postcss` 4.3.5, `next-intl` 4.15.1, all more than two weeks old when chosen. The build scripts of their transitive dependencies (`@parcel/watcher`, `@swc/core`) stay blocked: neither is needed to build or run.
4. **Not decided here.** Component primitives (accessible menus, dialogs, drag and drop) and the outliner library stay open in `P-009`.

## Considered options
- **CSS Modules or plain CSS.** No dependency, but more files and slower to iterate on screens and the reader.
- **A component library (Radix, shadcn/ui, Mantine).** Decides the primitives, which is the open point; it can be added on top of Tailwind later.
- **react-i18next or Lingui.** Work, but next-intl is built for the App Router and server components.

## Consequences
Every UI string is a message key; a hard-coded string in a component is a bug. The default category names (`lib/i18n/category-names.ts`) and the text of the authentication emails (`apps/worker/src/tasks/mail-text.ts`) are still stopgaps and move to the messages in a later slice.
