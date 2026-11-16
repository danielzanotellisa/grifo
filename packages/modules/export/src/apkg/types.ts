/** Input of the .apkg generator (ADR 0027). One row per flashcard. */
export type ApkgNote = {
  guid: string; // ankiGuid(flashcard.id) from @app/study — stable forever
  deck: string; // deckName(subject, document) from @app/study, e.g. "Redes::TCP"
  front: string; // plain text; the generator escapes it to HTML
  back: string;
  source: string; // e.g. "Redes › TCP.pdf, p. 12"
  tags: string[];
  modifiedAt: Date; // flashcard.updatedAt — lets Anki decide whether an update is newer
};
