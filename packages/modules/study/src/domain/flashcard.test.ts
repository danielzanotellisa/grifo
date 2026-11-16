import { OUTLINE_ROLES } from "@app/platform";
import { effectiveRole } from "@app/outline";
import { describe, expect, it } from "vitest";
import { canCreateFlashcard } from "./flashcard";

describe("canCreateFlashcard", () => {
  it.each(OUTLINE_ROLES)(
    "[outline-node#AC-3] node with effective role %s offers a flashcard only for DEFINITION",
    (role) => {
      const own = { role };
      const inherited = { role: null };

      expect(canCreateFlashcard(effectiveRole(own, null))).toBe(role === "DEFINITION");
      expect(canCreateFlashcard(effectiveRole(inherited, role))).toBe(role === "DEFINITION");
    },
  );
});
