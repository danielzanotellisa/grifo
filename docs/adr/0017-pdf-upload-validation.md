# 0017. PDF validation and scanning on upload

- Status: accepted
- Date: 2026-11-15

## Context
Every uploaded PDF is untrusted. CVE-2024-4367 let a malicious PDF run JavaScript in the host page with PDF.js ≤ 4.1.392 (fixed in 4.2.67; mitigation: `isEvalSupported: false`). PDFs can also carry active content: `/JavaScript`, `/OpenAction`, `/AA`, `/Launch`, embedded files, XFA. Our reader does not execute it, but exported files open in readers that do.

## Decision
Document states: `UPLOADED → VALIDATING → READY | REJECTED`, and `READY → QUARANTINED`.
1. Fast validation (synchronous, on upload confirm): `%PDF` signature, declared hash matches, size, structurally parseable. Failure → `REJECTED` with a clear message.
2. Deep scan (job): ClamAV plus an inventory of active-content keys stored as `riskFlags`. Malware → `QUARANTINED` (no longer opens, user notified). Active content alone does not block (common in legitimate PDFs); it is recorded.
3. Hardened reader: engine kept current with dependency scanning in CI; eval disabled; rendering in a Web Worker; CSP without `unsafe-eval`; originals served from a different origin than the app with `X-Content-Type-Options: nosniff`.
4. Clean exports: annotated PDFs are stripped of active content; summary PDFs are generated from scratch.

## Considered options
- Block every PDF with active content: rejects legitimate material.
- Wait for the deep scan before reading: hurts usability; the hardened reader makes it safe to read after fast validation.

## Consequences
ClamAV needs ~1 GB RAM. If a document is quarantined while open, the reader closes with an explanation. Export sanitization is tested with sample malicious PDFs.
