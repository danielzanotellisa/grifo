# 0001. Desktop web platform

- Status: accepted
- Date: 2026-11-15

## Context
Users study long PDFs on a computer with mouse and keyboard. Supporting touch and small screens from day one would multiply UI work without serving the real use.

## Decision
Web app for current desktop versions of Chrome, Edge, Firefox and Safari, minimum width 1280 px. Keyboard shortcuts and right-click menus are first-class.

## Considered options
- Desktop app (Electron/Tauri): the browser already provides what is needed, without installation.
- Responsive web from the MVP: deferred for cost.

## Consequences
Dense layouts (reader + highlights panel + flashcards panel) are fine. Mobile, if it comes, starts as a read-only review mode.
