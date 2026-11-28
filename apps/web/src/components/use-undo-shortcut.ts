import { useEffect } from "react";

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Ctrl+Z (Cmd+Z) undoes the delete the notice reports, except inside a text field (`_cross-cutting/undo`). */
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
