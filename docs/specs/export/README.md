# Export — spec

- Status: draft
- Module: export
- ADRs: 0017, 0020, 0027, 0028, 0029

## Definition
A file generated for the user by a background job.

## Kinds
| Kind | Scope | Output |
| --- | --- | --- |
| `SUMMARY_PDF` | document, subject | Outline rendered with a `SummaryTemplate`. |
| `ANNOTATED_PDF` | document | Original + real `/Highlight` annotations, active content stripped. |
| `FLASHCARDS_APKG` | document, subject | Anki package with the frozen note type (ADR 0027); imports into Anki and Noji. |
| `FULL_DATA` | account | Archive with originals, JSON data and one .apkg per subject. |

## Lifecycle
`QUEUED → RUNNING → SUCCEEDED | FAILED`; `RUNNING → QUEUED` on automatic retry (max 3); `FAILED → QUEUED` on "try again".

## Invariants
1. Rendered from the sync cursor recorded at request time.
2. Output key derived from the export id, in the `derived` bucket; available 30 days, regenerable.
3. Every kind passes `EntitlementPolicy`.

## Acceptance criteria
- [ ] **AC-1** Given a request, then the API answers 202 with the export id in < 300 ms, regardless of size.
- [ ] **AC-2** Given the job finishes, then the client receives an `export` SSE event and the file downloads via a presigned URL.
- [ ] **AC-3** Given a node is edited while a summary renders, then the file reflects the state at request time.
- [ ] **AC-4** A 500-card .apkg completes in < 5 s; a 300-node summary in < 30 s (ADR 0014).

## Open questions
- .apkg generator and Noji re-import behavior: `P-011`.
