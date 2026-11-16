# 0028. Summary PDF rendering with Gotenberg

- Status: accepted
- Date: 2026-11-15
- Related: 0017, 0020

## Context
Summary templates should be designed and prototyped as HTML/CSS and rendered with high fidelity (fonts, colors, page counters) in a controlled environment, without making the worker heavy.

## Decision
Gotenberg (Chromium variant) runs as a container. The worker builds a self-contained HTML document from the outline and posts it, with font/image files, to `POST /forms/chromium/convert/html` (`preferCssPageSize`, `printBackground`). Page size, margins and running headers/page numbers come from CSS `@page`.

Security: Gotenberg runs with JavaScript disabled, only on the internal network (localhost-bound in development), and receives HTML built exclusively through an escaping template helper. Templates load nothing from the network.

## Considered options
- Playwright/Puppeteer inside the worker: same fidelity, heavier worker and browser lifecycle to manage.
- @react-pdf/renderer: light, but a CSS subset makes rich templates harder; kept as fallback.
- Typst: excellent typesetting, but templates would not reuse HTML prototypes.

## Consequences
One more container (~500 MB image, a few hundred MB RAM while rendering). Templates are HTML files versioned in the export module. Closes P-001.
