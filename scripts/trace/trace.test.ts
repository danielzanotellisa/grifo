import { describe, expect, it } from "vitest";
import {
  checkPrBody,
  findRefs,
  parseSpec,
  parseTraceField,
  specIdFromPath,
  validate,
  type SourceFile,
  type Spec,
} from "./trace";

const approved: Spec = { status: "approved", criteria: ["AC-1", "AC-2"], unnumbered: 0 };
const draft: Spec = { status: "draft", criteria: ["AC-1"], unnumbered: 0 };
const specs = new Map<string, Spec>([
  ["highlight", approved],
  ["deck", draft],
]);
const adrs = new Set(["ADR-0004", "ADR-0030"]);

const test = (path: string, text: string): SourceFile => ({ path, text, isTest: true });

describe("specIdFromPath", () => {
  it.each([
    ["highlight/README.md", "highlight"],
    ["highlight/right-click-menu.md", "highlight/right-click-menu"],
    ["_cross-cutting/sync/README.md", "_cross-cutting/sync"],
  ])("%s -> %s", (path, id) => {
    expect(specIdFromPath(path)).toBe(id);
  });
});

describe("parseSpec", () => {
  const md = [
    "# Highlight — spec",
    "",
    "- Status: approved",
    "",
    "## Acceptance criteria",
    "- [ ] **AC-1** Given a selection, then a highlight appears.",
    "- [x] **AC-2** Given zoom changes, then it stays aligned.",
    "",
    "## Open questions",
    "- [ ] not a criterion",
  ].join("\n");

  it("reads status and numbered criteria of the acceptance section only", () => {
    expect(parseSpec(md)).toEqual({
      status: "approved",
      criteria: ["AC-1", "AC-2"],
      unnumbered: 0,
    });
  });

  it("counts criteria without an id", () => {
    const spec = parseSpec("- Status: draft\n\n## Acceptance criteria\n- [ ] Given x, then y.\n");
    expect(spec).toEqual({ status: "draft", criteria: [], unnumbered: 1 });
  });

  it("returns undefined status when absent or unknown", () => {
    expect(parseSpec("# x\n").status).toBeUndefined();
    expect(parseSpec("- Status: wip\n").status).toBeUndefined();
  });
});

describe("findRefs", () => {
  it("finds spec#AC references anywhere in text", () => {
    const text = 'it("[highlight#AC-1] creates", () => {}); // _cross-cutting/sync#AC-12';
    expect(findRefs(text)).toEqual([
      { specId: "highlight", ac: "AC-1" },
      { specId: "_cross-cutting/sync", ac: "AC-12" },
    ]);
  });

  it("ignores text without the AC marker", () => {
    expect(findRefs("see highlight and #AC-1 alone")).toEqual([]);
  });
});

describe("parseTraceField", () => {
  it("accepts n/a case-insensitively", () => {
    expect(parseTraceField(" `N/A` ")).toEqual({ na: true, items: [] });
  });

  it("splits a comma list and strips backticks", () => {
    expect(parseTraceField("`highlight#AC-1`, deck")).toEqual({
      na: false,
      items: ["highlight#AC-1", "deck"],
    });
  });

  it("treats empty value as no items", () => {
    expect(parseTraceField("  ")).toEqual({ na: false, items: [] });
  });
});

describe("validate", () => {
  it("passes when every ref exists and every approved AC has a test ref", () => {
    const files = [test("a.test.ts", "// highlight#AC-1 highlight#AC-2")];
    expect(validate({ specs, files })).toEqual([]);
  });

  it("flags a reference to an unknown spec", () => {
    const files = [test("a.test.ts", "// nope#AC-1 highlight#AC-1 highlight#AC-2")];
    expect(validate({ specs, files })).toEqual(["a.test.ts: unknown spec in reference nope#AC-1"]);
  });

  it("flags a reference to an unknown criterion", () => {
    const files = [test("a.test.ts", "// highlight#AC-1 highlight#AC-2 highlight#AC-9")];
    expect(validate({ specs, files })).toEqual([
      "a.test.ts: unknown criterion in reference highlight#AC-9",
    ]);
  });

  it("flags an approved criterion that no test covers", () => {
    const files = [test("a.test.ts", "// highlight#AC-1")];
    expect(validate({ specs, files })).toEqual([
      "highlight#AC-2: approved criterion has no test reference",
    ]);
  });

  it("does not count references outside test files as coverage", () => {
    const files: SourceFile[] = [
      { path: "impl.ts", text: "// highlight#AC-1 highlight#AC-2", isTest: false },
    ];
    expect(validate({ specs, files })).toHaveLength(2);
  });

  it("does not require coverage for draft specs", () => {
    expect(validate({ specs: new Map([["deck", draft]]), files: [] })).toEqual([]);
  });

  it("flags criteria without an id and unknown status", () => {
    const bad = new Map<string, Spec>([["x", { status: undefined, criteria: [], unnumbered: 2 }]]);
    expect(validate({ specs: bad, files: [] })).toEqual([
      "x: Status must be draft or approved",
      "x: 2 acceptance criteria without an AC-n id",
    ]);
  });

  it("flags duplicate criterion ids", () => {
    const dup = new Map<string, Spec>([
      ["x", { status: "draft", criteria: ["AC-1", "AC-1"], unnumbered: 0 }],
    ]);
    expect(validate({ specs: dup, files: [] })).toEqual(["x: duplicate criterion AC-1"]);
  });
});

describe("checkPrBody", () => {
  const body = (spec: string, adr: string) => `## Spec e ADR\n- Spec: ${spec}\n- ADR: ${adr}\n`;

  it("accepts existing spec, criterion and ADR", () => {
    expect(checkPrBody(body("`highlight#AC-1`, deck", "`ADR-0004`"), { specs, adrs })).toEqual([]);
  });

  it("accepts explicit n/a for both", () => {
    expect(checkPrBody(body("n/a", "n/a"), { specs, adrs })).toEqual([]);
  });

  it("flags missing lines", () => {
    expect(checkPrBody("nothing here", { specs, adrs })).toEqual([
      "PR body: missing '- Spec:' line",
      "PR body: missing '- ADR:' line",
    ]);
  });

  it("flags empty values", () => {
    expect(checkPrBody(body("", ""), { specs, adrs })).toEqual([
      "PR body: Spec is empty (use a spec id or n/a)",
      "PR body: ADR is empty (use ADR-NNNN or n/a)",
    ]);
  });

  it("flags unknown spec, unknown criterion and unknown ADR", () => {
    expect(checkPrBody(body("nope, highlight#AC-9", "ADR-9999"), { specs, adrs })).toEqual([
      "PR body: unknown spec nope",
      "PR body: unknown criterion highlight#AC-9",
      "PR body: unknown ADR ADR-9999",
    ]);
  });

  it("flags the untouched template placeholder", () => {
    expect(checkPrBody(body("`docs/specs/...`", "`ADR-NNNN`"), { specs, adrs })).toEqual([
      "PR body: unknown spec docs/specs/...",
      "PR body: unknown ADR ADR-NNNN",
    ]);
  });
});
