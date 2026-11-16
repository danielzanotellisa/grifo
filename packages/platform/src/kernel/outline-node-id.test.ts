import { validate, version } from "uuid";
import { describe, expect, it } from "vitest";
import { newId } from "../ids";
import { outlineNodeIdForHighlight } from "./outline-node-id";

describe("outlineNodeIdForHighlight", () => {
  it("[outline-node#AC-15] is a deterministic UUIDv5 of the highlight id", () => {
    const highlightId = newId();

    const nodeId = outlineNodeIdForHighlight(highlightId);

    expect(validate(nodeId)).toBe(true);
    expect(version(nodeId)).toBe(5);
    expect(nodeId).toBe(outlineNodeIdForHighlight(highlightId));
    expect(nodeId).not.toBe(highlightId);
    expect(outlineNodeIdForHighlight(newId())).not.toBe(nodeId);
  });

  it("[outline-node#AC-15] never changes for a given highlight (the namespace is part of the contract)", () => {
    expect(outlineNodeIdForHighlight("01a1e523-6f4d-7665-9815-d127775687b6")).toBe(
      "b2359437-932c-59d7-a333-ac876ff798cb",
    );
  });
});
