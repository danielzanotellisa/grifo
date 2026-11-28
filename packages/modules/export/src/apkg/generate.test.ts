import { unzipSync, strFromU8 } from "fflate";
import initSqlJs, { type Database } from "sql.js";
import { describe, expect, it } from "vitest";
import { NOTE_TYPE, stableIntId } from "./note-type";
import { generateApkg } from "./generate";
import type { ApkgNote } from "./types";

const note = (over: Partial<ApkgNote> = {}): ApkgNote => ({
  guid: "grifo-1",
  deck: "Redes::TCP",
  front: "O que é TCP?",
  back: "Protocolo orientado a conexão",
  source: "Redes › TCP, p. 3",
  tags: ["Redes", "TCP", "page_3"],
  modifiedAt: new Date("2026-11-20T10:00:00Z"),
  ...over,
});

const open = async (bytes: Uint8Array): Promise<{ db: Database; media: string }> => {
  const files = unzipSync(bytes);
  const SQL = await initSqlJs();
  return {
    db: new SQL.Database(files["collection.anki2"]),
    media: strFromU8(files["media"]!),
  };
};
const rows = (db: Database, sql: string) => {
  const [result] = db.exec(sql);
  return result ? result.values : [];
};

describe("generateApkg", () => {
  it("[export/apkg#AC-1] writes one note per card with fields, guid, note type and tags", async () => {
    const { db, media } = await open(
      await generateApkg([note(), note({ guid: "grifo-2", front: "UDP", back: "Sem conexão" })]),
    );

    expect(media).toBe("{}");
    const notes = rows(db, "select guid, mid, flds, tags, mod from notes order by guid");
    expect(notes).toHaveLength(2);
    expect(notes[0]).toEqual([
      "grifo-1",
      NOTE_TYPE.id,
      "O que é TCP?\u001fProtocolo orientado a conexão\u001fRedes › TCP, p. 3",
      " Redes TCP page_3 ",
      Math.floor(new Date("2026-11-20T10:00:00Z").getTime() / 1000),
    ]);
    expect(rows(db, "select count(*) from cards")).toEqual([[2]]);
  });

  it("[export/apkg#AC-2] makes one deck per name, each card in its own", async () => {
    const { db } = await open(
      await generateApkg([
        note(),
        note({ guid: "grifo-2", deck: "Redes::UDP" }),
        note({ guid: "grifo-3", deck: "Redes::UDP" }),
      ]),
    );

    const [decks] = rows(db, "select decks from col") as [[string]];
    const names = Object.values(JSON.parse(decks[0]) as Record<string, { name: string }>).map(
      (d) => d.name,
    );
    expect(names.sort()).toEqual(["Default", "Redes::TCP", "Redes::UDP"]);
    const perDeck = rows(db, "select did, count(*) from cards group by did order by did");
    expect(perDeck).toEqual(
      [
        [stableIntId("Redes::TCP"), 1],
        [stableIntId("Redes::UDP"), 2],
      ].sort((a, b) => a![0]! - b![0]!),
    );
  });

  it("[export/apkg#AC-3] keeps ids stable between exports and moves the modification time on an edit", async () => {
    const first = await open(await generateApkg([note()]));
    const again = await open(
      await generateApkg([
        note({ front: "O que é o TCP?", modifiedAt: new Date("2026-11-25T10:00:00Z") }),
      ]),
    );

    const query = "select id, guid, mid, mod from notes";
    const [a] = rows(first.db, query) as [[number, string, number, number]];
    const [b] = rows(again.db, query) as [[number, string, number, number]];
    expect(b.slice(0, 3)).toEqual(a.slice(0, 3));
    expect(b[3]).toBeGreaterThan(a[3]);
    expect(rows(first.db, "select id, did from cards")).toEqual(
      rows(again.db, "select id, did from cards"),
    );
    const models = JSON.parse((rows(first.db, "select models from col") as [[string]])[0]![0]);
    expect(Object.keys(models)).toEqual([String(NOTE_TYPE.id)]);
    expect(models[NOTE_TYPE.id].flds.map((f: { name: string }) => f.name)).toEqual([
      "Front",
      "Back",
      "Source",
    ]);
  });

  it("[export/apkg#AC-4] escapes HTML in the fields and still builds a package with no cards", async () => {
    const { db } = await open(
      await generateApkg([note({ front: "<b>a</b> & b", back: "x < y", source: '"s"' })]),
    );
    const [flds] = rows(db, "select flds from notes") as [[string]];
    expect(flds[0]).toBe("&lt;b&gt;a&lt;/b&gt; &amp; b\u001fx &lt; y\u001f&quot;s&quot;");

    const empty = await open(await generateApkg([]));
    expect(rows(empty.db, "select count(*) from notes")).toEqual([[0]]);
    expect(rows(empty.db, "select count(*) from col")).toEqual([[1]]);
  });
});
