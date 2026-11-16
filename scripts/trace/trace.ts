export type Spec = {
  status: "draft" | "approved" | undefined;
  criteria: string[];
  unnumbered: number;
};

export type SourceFile = { path: string; text: string; isTest: boolean };

export type Ref = { specId: string; ac: string };

type Catalog = { specs: Map<string, Spec>; adrs: Set<string> };

export function specIdFromPath(relPath: string): string {
  return relPath.replace(/\/README\.md$/, "").replace(/\.md$/, "");
}

export function parseSpec(markdown: string): Spec {
  const status = /^- Status:\s*(draft|approved)\s*$/m.exec(markdown)?.[1] as Spec["status"];
  const section =
    /^## Acceptance criteria\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(markdown)?.[1] ?? "";
  const criteria: string[] = [];
  let unnumbered = 0;
  for (const line of section.split("\n")) {
    if (!/^- \[[ xX]\]/.test(line)) continue;
    const id = /^- \[[ xX]\] \*\*(AC-\d+)\*\*/.exec(line)?.[1];
    if (id) criteria.push(id);
    else unnumbered++;
  }
  return { status, criteria, unnumbered };
}

export function findRefs(text: string): Ref[] {
  const refs: Ref[] = [];
  for (const m of text.matchAll(/(?<![\w/-])(\w[\w/-]*)#(AC-\d+)\b/g)) {
    refs.push({ specId: m[1]!, ac: m[2]! });
  }
  return refs;
}

export function parseTraceField(value: string): { na: boolean; items: string[] } {
  const clean = value.replaceAll("`", "").trim();
  if (clean.toLowerCase() === "n/a") return { na: true, items: [] };
  return {
    na: false,
    items: clean
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

export function validate({
  specs,
  files,
}: {
  specs: Map<string, Spec>;
  files: SourceFile[];
}): string[] {
  const errors: string[] = [];

  for (const [id, spec] of specs) {
    if (!spec.status) errors.push(`${id}: Status must be draft or approved`);
    if (spec.unnumbered > 0) {
      errors.push(`${id}: ${spec.unnumbered} acceptance criteria without an AC-n id`);
    }
    const seen = new Set<string>();
    for (const ac of spec.criteria) {
      if (seen.has(ac)) errors.push(`${id}: duplicate criterion ${ac}`);
      seen.add(ac);
    }
  }

  const covered = new Set<string>();
  for (const file of files) {
    const keys = new Set(findRefs(file.text).map((r) => `${r.specId}#${r.ac}`));
    for (const key of keys) {
      const [specId, ac] = key.split("#") as [string, string];
      const spec = specs.get(specId);
      if (!spec) errors.push(`${file.path}: unknown spec in reference ${key}`);
      else if (!spec.criteria.includes(ac)) {
        errors.push(`${file.path}: unknown criterion in reference ${key}`);
      } else if (file.isTest) covered.add(key);
    }
  }

  for (const [id, spec] of specs) {
    if (spec.status !== "approved") continue;
    for (const ac of new Set(spec.criteria)) {
      if (!covered.has(`${id}#${ac}`)) {
        errors.push(`${id}#${ac}: approved criterion has no test reference`);
      }
    }
  }

  return errors;
}

export function checkPrBody(body: string, { specs, adrs }: Catalog): string[] {
  const specLine = /^- Spec:(.*)$/m.exec(body);
  const adrLine = /^- ADR:(.*)$/m.exec(body);
  const errors: string[] = [];

  if (!specLine) errors.push("PR body: missing '- Spec:' line");
  if (!adrLine) errors.push("PR body: missing '- ADR:' line");

  if (specLine) {
    const field = parseTraceField(specLine[1]!);
    if (!field.na && field.items.length === 0) {
      errors.push("PR body: Spec is empty (use a spec id or n/a)");
    }
    for (const item of field.items) {
      const [specId, ac] = item.split("#") as [string, string | undefined];
      const spec = specs.get(specId);
      if (!spec) errors.push(`PR body: unknown spec ${specId}`);
      else if (ac && !spec.criteria.includes(ac)) errors.push(`PR body: unknown criterion ${item}`);
    }
  }

  if (adrLine) {
    const field = parseTraceField(adrLine[1]!);
    if (!field.na && field.items.length === 0) {
      errors.push("PR body: ADR is empty (use ADR-NNNN or n/a)");
    }
    for (const item of field.items) {
      if (!adrs.has(item)) errors.push(`PR body: unknown ADR ${item}`);
    }
  }

  return errors;
}
