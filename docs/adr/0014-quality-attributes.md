# 0014. Quality attributes and measurable scenarios

- Status: accepted
- Date: 2026-11-15

## Context
Without explicit priorities every technical choice becomes a debate; without numbers nobody can tell whether a stack or an implementation is good enough.

## Decision
Priority for trade-offs: usability > durability > performance, with a **durability floor**: no usability or performance gain may allow losing data already confirmed locally. Showing "saved" before the server confirms is fine (it is in IndexedDB); showing it before the local write is not.

API usability: contract in OpenAPI before implementation, names from the glossary, errors as RFC 9457 Problem Details with actionable messages.

| Attribute | Situation | Expected response | Target |
| --- | --- | --- | --- |
| Usability | Highlight a passage | Highlight visible in the chosen category | ≤ 2 actions; visual feedback < 100 ms |
| Usability | Flashcard from a DEFINITION node | Card created without leaving the reader | ≤ 3 actions |
| Durability | Browser closes 1 s after a highlight | Highlight present on reopen | 100% |
| Durability | Database disk lost | Restore from backup (0018) | RPO ≤ 5 min; RTO ≤ 1 h |
| Durability | Subject deleted by mistake | Restored from trash | Available 30 days |
| Performance | Open a 300-page PDF already cached | First page visible | < 1 s |
| Performance | Open the same PDF uncached | First page visible | < 3 s |
| Performance | Change in one browser | Visible in another open browser | < 2 s (0015) |
| Performance | Export .apkg with 500 flashcards | File ready | < 5 s |
| Performance | Summary PDF with 300 nodes | Job done, progress visible | < 30 s (0020) |

## Consequences
Targets become tests; durability tests (close the browser mid-sync, drop the network) are in the suite from the start. Stack options are judged against this table. Targets change only through a new ADR.
