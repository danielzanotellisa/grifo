# P-014. LGPL native library pulled in by Next.js (sharp)

- Status: open
- Blocks: nothing
- Related: ADR 0012, `apps/web`

## Problem
ADR 0012 allows permissive licenses only. The lockfile contains `@img/sharp-libvips-*`, licensed LGPL-3.0-or-later. It is the prebuilt libvips binary of `sharp`, which Next.js installs for image optimization. It predates the authentication work: the lockfile on `main` already had it (found while auditing the licenses of Better Auth, which does not add it).

## Options (with trade-offs)
- Turn off the Next.js image optimization (`images.unoptimized`) and keep `sharp` out of the install: nothing in the app needs optimized images (PDFs are rendered in the reader, not served as images). Cheapest, and clean.
- Keep it and record an ADR that accepts a dynamically linked, unmodified LGPL binary: the mildest case, but it needs a decision and a note in the third-party notices.
- Replace the image loader: more work than the need justifies.

## Recommendation
Turn the image optimization off and exclude `sharp` (check that the install no longer resolves `@img/sharp-libvips-*`), then add a license check to CI so a non-permissive package cannot enter silently.

## How to close
Apply the option, verify with `pnpm licenses list --prod`, and set the status.
