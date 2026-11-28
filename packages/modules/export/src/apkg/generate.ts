import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import initSqlJs from "sql.js";
import { NOTE_TYPE, stableIntId } from "./note-type";
import type { ApkgNote } from "./types";

const FIELD_SEPARATOR = "\u001f";

const escapeField = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Anki's field checksum: the first 8 hex digits of the SHA-1 of the sort field, as an integer. */
const checksum = (text: string): number =>
  Number.parseInt(createHash("sha1").update(text).digest("hex").slice(0, 8), 16);

const seconds = (date: Date): number => Math.floor(date.getTime() / 1000);

const SCHEMA = `
create table col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
create table notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
create table cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
create table revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
create table graves (usn integer not null, oid integer not null, type integer not null);
create index ix_notes_usn on notes (usn);
create index ix_cards_usn on cards (usn);
create index ix_revlog_usn on revlog (usn);
create index ix_cards_nid on cards (nid);
create index ix_cards_sched on cards (did, queue, due);
create index ix_revlog_cid on revlog (cid);
create index ix_notes_csum on notes (csum);
`;

const deckEntry = (id: number, name: string, at: number) => ({
  id,
  name,
  mod: at,
  usn: -1,
  desc: "",
  dyn: 0,
  collapsed: false,
  browserCollapsed: false,
  conf: 1,
  extendNew: 0,
  extendRev: 0,
  newToday: [0, 0],
  revToday: [0, 0],
  lrnToday: [0, 0],
  timeToday: [0, 0],
});

const deckConfig = (at: number) => ({
  id: 1,
  name: "Default",
  mod: at,
  usn: -1,
  maxTaken: 60,
  autoplay: true,
  timer: 0,
  replayq: true,
  new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
  rev: { bury: true, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
  lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
});

const noteType = (at: number) => ({
  id: NOTE_TYPE.id,
  name: NOTE_TYPE.name,
  type: 0,
  mod: at,
  usn: -1,
  sortf: 0,
  did: null,
  tags: [],
  vers: [],
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexPost: "\\end{document}",
  css: NOTE_TYPE.css,
  flds: NOTE_TYPE.fields.map((name, ord) => ({
    name,
    ord,
    sticky: false,
    rtl: false,
    font: "Arial",
    size: 20,
    media: [],
  })),
  tmpls: [
    {
      name: "Card 1",
      ord: 0,
      qfmt: NOTE_TYPE.front,
      afmt: NOTE_TYPE.back,
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
    },
  ],
  req: [[0, "all", [0]]],
});

/**
 * The `.apkg` of ADR 0027: a zip with the SQLite collection and an empty media map, in the layout
 * genanki writes. Ids derive from the GUID and the deck name, so a second export of the same
 * cards produces the same ids and Anki updates in place.
 */
export async function generateApkg(notes: ApkgNote[]): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(SCHEMA);
    const at = notes.reduce((latest, n) => Math.max(latest, seconds(n.modifiedAt)), 0);

    const decks: Record<string, unknown> = { "1": deckEntry(1, "Default", at) };
    for (const { deck } of notes) {
      const id = stableIntId(deck);
      decks[String(id)] ??= deckEntry(id, deck, at);
    }

    db.run("insert into col values (1, ?, ?, ?, 11, 0, -1, 0, ?, ?, ?, ?, '')", [
      at,
      at * 1000,
      at * 1000,
      JSON.stringify({
        nextPos: 1,
        estTimes: true,
        activeDecks: [1],
        sortType: "noteFld",
        timeLim: 0,
        sortBackwards: false,
        addToCur: true,
        curDeck: 1,
        newBury: true,
        newSpread: 0,
        dueCounts: true,
        curModel: String(NOTE_TYPE.id),
        collapseTime: 1200,
      }),
      JSON.stringify({ [NOTE_TYPE.id]: noteType(at) }),
      JSON.stringify(decks),
      JSON.stringify({ "1": deckConfig(at) }),
    ]);

    notes.forEach((note, index) => {
      const fields = [note.front, note.back, note.source].map(escapeField);
      const noteId = stableIntId(note.guid);
      const modified = seconds(note.modifiedAt);
      db.run("insert into notes values (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')", [
        noteId,
        note.guid,
        NOTE_TYPE.id,
        modified,
        note.tags.length > 0 ? ` ${note.tags.join(" ")} ` : "",
        fields.join(FIELD_SEPARATOR),
        fields[0]!,
        checksum(fields[0]!),
      ]);
      db.run("insert into cards values (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')", [
        stableIntId(`card:${note.guid}`),
        noteId,
        stableIntId(note.deck),
        modified,
        index + 1,
      ]);
    });

    return zipSync({
      "collection.anki2": db.export(),
      media: strToU8("{}"),
    });
  } finally {
    db.close();
  }
}
