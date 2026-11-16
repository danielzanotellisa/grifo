# SummaryTemplate — spec

- Status: draft
- Module: export
- ADRs: 0020, 0028

## Definition
A versioned layout that turns an outline into a PDF. Lives in code, not in the database.

## Rules
1. Identified by `id` + integer `version`. A visual change is a new version; old versions stay so past exports can be regenerated identically.
2. Input: the outline tree with effective roles, highlight colors/category names, document and subject titles, source page per node.
3. Each role has a defined presentation: `TOPIC` → heading (level by depth), `DEFINITION` → highlighted definition block, `ITEM` → bullet with indentation by depth.
4. Every page shows the source attribution (document title).
5. A template is a self-contained HTML/CSS document rendered by Gotenberg: `@page` defines size, margins and page numbers; fonts/images are shipped with the request; no network loads, no JavaScript.
6. All user text enters the template through the escaping `html` helper.

## Open questions
- Visual design: prototype 2–3 templates as HTML before coding.
