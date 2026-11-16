import { createHash } from "node:crypto";

/**
 * The single Anki note type this app exports (ADR 0027).
 * NEVER change `id` or the field list: Anki matches existing notes by GUID *and* note type,
 * so changing them turns every re-import into conflicts or duplicates.
 * A different layout means a NEW note type with a new id, recorded in an ADR.
 */
export const NOTE_TYPE = {
  id: 1763164800000,
  name: "Grifo Basic",
  fields: ["Front", "Back", "Source"] as const,
  front: "{{Front}}",
  back: '{{FrontSide}}<hr id="answer">{{Back}}<div class="source">{{Source}}</div>',
  css: ".card{font-family:system-ui,sans-serif;font-size:20px;text-align:left}.source{margin-top:1em;font-size:.7em;opacity:.6}",
} as const;

const MIN_ID = 2 ** 40; // keeps clear of Anki's built-in ids (the Default deck is 1)
const RANGE = 2 ** 52 - MIN_ID;

/** Deterministic positive integer (safe in JS and as SQLite int64) for deck ids and similar. */
export function stableIntId(input: string): number {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 13); // 52 bits
  return (Number.parseInt(hex, 16) % RANGE) + MIN_ID;
}
