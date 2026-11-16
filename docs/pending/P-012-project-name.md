# P-012. Project name

- Status: decided → **Grifo** (2026-11-15)
- Blocks: renaming the repo, package scope, note type name (`NOTE_TYPE.name`), compose project name

## Notes
- "Highlightr" is taken in the same niche: a popular Obsidian highlighting plugin.
- Before deciding: check domain availability and a trademark search (INPI in Brazil).

## How to close
Pick the name, then rename in one commit: repo folder, `name` in root package.json and docker-compose, `NOTE_TYPE.name`, titles in README/CLAUDE.md. The `@app/*` package scope can stay.

## Decision
Name: **Grifo** (pt-BR "grifar" = to highlight while studying). Renamed: repo folder, root package and compose project, database `grifo`, Anki note type "Grifo Basic", Anki GUID prefix `grifo-`. Still to do before launch: domain and INPI trademark search.
