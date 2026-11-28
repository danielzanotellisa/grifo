import { useEffect } from "react";

/** A field with text keeps Ctrl+Z for its own typing; an empty one has nothing to undo, so the delete is undone. */
const isTextField = (target: EventTarget | null): boolean => {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.value !== "";
  }
  return target instanceof HTMLElement && target.isContentEditable;
};

/** Ctrl+Z (Cmd+Z) undoes the delete the notice reports, except in a field that has text (`_cross-cutting/undo`). */
export function useUndoShortcut(onUndo: (() => void) | null): void {
  useEffect(() => {
    if (!onUndo) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || event.shiftKey || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey) || isTextField(event.target)) return;
      event.preventDefault();
      onUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndo]);
}
