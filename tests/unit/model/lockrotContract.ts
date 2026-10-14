// lockrot's recorded bundle, fetched at the pinned commit by `npm run contract:fetch` (DESIGN.md §7).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(process.cwd(), ".lockrot", "tests", "fixtures");

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fetched(...parts: string[]): string {
  const path = join(FIXTURES, ...parts);
  if (!existsSync(path)) {
    throw new Error(`${path} is missing: run \`npm run contract:fetch\` first`);
  }
  return path;
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dir, name));
}

/** Every bare report-2 document of the bundle, by its path below tests/fixtures/. */
export function reportDocuments(): { name: string; document: unknown }[] {
  return [...jsonFiles(fetched("contract", "report-2")), ...jsonFiles(fetched("contract", "model-only"))].map(
    (path) => ({ name: path.slice(FIXTURES.length + 1), document: readJson(path) }),
  );
}

/** The html embeds `{report, details}` lockrot recorded for the baselined scenarios. */
export function embeds(): { name: string; embed: unknown }[] {
  const baselined = fetched("baselined");
  return readdirSync(baselined)
    .sort()
    .map((scenario) => join(baselined, scenario, "check", "report.bundle.json"))
    .filter((path) => existsSync(path))
    .map((path) => ({ name: path.slice(FIXTURES.length + 1), embed: readJson(path) }));
}
