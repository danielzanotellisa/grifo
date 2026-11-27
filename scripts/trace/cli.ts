import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  checkPrBody,
  parseSpec,
  specIdFromPath,
  validate,
  type SourceFile,
  type Spec,
} from "./trace";

const root = process.cwd();
const SPEC_ROOT_SKIP = new Set(["_template.md", "glossary.md", "README.md"]);
const SOURCE_SKIP = new Set(["node_modules", ".next", "dist"]);

function walk(dir: string, ignore: (dir: string, name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignore(dir, entry.name)) return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full, ignore) : [full];
  });
}

function loadSpecs(): Map<string, Spec> {
  const base = join(root, "docs/specs");
  const specs = new Map<string, Spec>();
  for (const file of walk(base, (dir, name) => dir === base && SPEC_ROOT_SKIP.has(name)).filter(
    (f) => f.endsWith(".md"),
  )) {
    specs.set(specIdFromPath(relative(base, file)), parseSpec(readFileSync(file, "utf8")));
  }
  return specs;
}

function loadAdrs(): Set<string> {
  const ids = readdirSync(join(root, "docs/adr"))
    .map((name) => /^(\d{4})-/.exec(name)?.[1])
    .filter((n): n is string => Boolean(n));
  return new Set(ids.map((n) => `ADR-${n}`));
}

function loadSources(): SourceFile[] {
  return ["apps", "packages"].flatMap((top) =>
    walk(join(root, top), (_dir, name) => SOURCE_SKIP.has(name))
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => ({
        path: relative(root, f),
        text: readFileSync(f, "utf8"),
        isTest: /\.(test|spec)\.tsx?$/.test(f),
      })),
  );
}

const command = process.argv[2];
let errors: string[];

if (command === "check") {
  errors = validate({ specs: loadSpecs(), files: loadSources() });
} else if (command === "pr-body") {
  errors = checkPrBody(process.env.PR_BODY ?? "", { specs: loadSpecs(), adrs: loadAdrs() });
} else {
  console.error("usage: cli.ts check | pr-body (PR text in the PR_BODY env var)");
  process.exit(2);
}

for (const error of errors) console.error(`✖ ${error}`);
if (errors.length > 0) process.exit(1);
console.log(`trace ${command}: ok`);
