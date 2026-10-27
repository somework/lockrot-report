// What lockrot recorded at the pinned commit, read the way the page reads it: a report-2 document,
// and the details of its one package (DESIGN.md §7).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";

import type { Finding, Report2, RepositoryMetadata, Run } from "../../../src/model/report";
import type { BlockKey } from "../blocks/blockGoldens";

const FIXTURES = join(process.cwd(), ".lockrot", "tests", "fixtures");
const CONTRACT = join(FIXTURES, "contract");

/** The strings lockrot's PHP grammars own, one object per case (`goldens/<case>.json`). */
export interface PhpGoldens {
  age_line: string | null;
  baseline_suffix: string | null;
  commands_posix: string[];
  commands_cmd: string[];
}

/** The model's strings for one case (`flags/cases.json`); the blocks of the detail sheet are `unknown` here and
 *  typed by the page's own projection (`tests/unit/blocks/blockGoldens.ts`). */
export interface ModelGoldens extends PhpGoldens, Record<BlockKey, unknown> {
  why: string[];
  checks: string;
}

export interface RecordedCase {
  name: string;
  report: Report2;
  finding: Finding;
  run: Run;
  metadata: RepositoryMetadata | null;
  php: PhpGoldens | null;
  /** "model" for a document the model wrote because the hydrator cannot rebuild it. */
  recordedBy: "lockrot" | "model";
}

export interface ModelCase {
  id: string;
  name: string;
  run: Run;
  finding: Finding;
  metadata: RepositoryMetadata | null;
  golden: ModelGoldens;
}

export function readContractJson(...parts: string[]): unknown {
  const path = join(CONTRACT, ...parts);
  if (!existsSync(path)) throw new Error(`${path} is missing: run \`npm run contract:fetch\` first`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function caseNames(dir: string): string[] {
  return readdirSync(join(CONTRACT, dir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

function metadataOf(name: string): RepositoryMetadata | null {
  if (!existsSync(join(CONTRACT, "explain-2", `${name}.json`))) {
    // A model-only document has no explain-2: the model's own details stand in for it.
    return modelCases().find((model) => model.name === name)?.metadata ?? null;
  }
  return (readContractJson("explain-2", `${name}.json`) as { metadata: RepositoryMetadata | null }).metadata;
}

/** The cases the hydrator cannot rebuild: the model wrote their documents, lockrot did not. */
export function modelOnlyNames(): string[] {
  return caseNames("model-only");
}

/** Every recorded document of exactly one finding, with the release branches of its package when lockrot wrote them. */
export function recordedCases(): RecordedCase[] {
  return [
    ...caseNames("report-2").map((name) => `report-2/${name}`),
    ...caseNames("model-only").map((name) => `model-only/${name}`),
  ]
    .map((path) => {
      const name = path.slice(path.indexOf("/") + 1);
      const report = readContractJson(`${path}.json`) as Report2;
      const php = existsSync(join(CONTRACT, "goldens", `${name}.json`))
        ? (readContractJson("goldens", `${name}.json`) as PhpGoldens)
        : null;
      return {
        name,
        report,
        finding: report.findings[0] as Finding,
        run: report.run,
        metadata: metadataOf(name),
        php,
        recordedBy: path.startsWith("model-only/") ? "model" : "lockrot",
      } satisfies RecordedCase;
    })
    .filter(({ report }) => report.findings.length === 1);
}

/** The recorded cases whose document lockrot wrote: only these can differ from the model's golden. */
export function lockrotRecordings(): RecordedCase[] {
  return recordedCases().filter(({ recordedBy }) => recordedBy === "lockrot");
}

/** The model's own inputs, each case under the name lockrot records it by. */
export function modelCases(): ModelCase[] {
  const { cases } = JSON.parse(readFileSync(join(FIXTURES, "flags", "cases.json"), "utf8")) as {
    cases: (Omit<ModelCase, "name" | "metadata"> & {
      details: { metadata: RepositoryMetadata | null } | null;
    })[];
  };
  return cases.map(({ details, ...model }) => ({
    ...model,
    name: model.id.replaceAll("‡", "-dagger"),
    metadata: details?.metadata ?? null,
  }));
}

/** Every recorded report-2 with more than one finding: the composite and the two baselined projects. */
export function multiFindingReports(): { name: string; report: Report2 }[] {
  const embeds = ["wallabag-2.6", "wallabag-main"].map((scenario) => ({
    name: `baselined/${scenario}`,
    report: (
      JSON.parse(
        readFileSync(join(FIXTURES, "baselined", scenario, "check", "report.bundle.json"), "utf8"),
      ) as { report: Report2 }
    ).report,
  }));
  return [
    { name: "composite", report: readContractJson("report-2", "composite.json") as Report2 },
    ...embeds,
  ];
}

/** One entry of `page-goldens.json`: the strings the model rendered from the root fields of `document`. */
export interface PageGolden {
  document: string;
  copy_summary: string[];
  panel: string[] | null;
  /** The Overview's three lines; null where the page shows no such line. */
  grade_line: string | null;
  figure_line: string | null;
  load_line: string | null;
  waffle_caption: string | null;
}

/** The model's report-2 of a golden's document, where lockrot's `PageGoldensTest` reads it. */
export function pageGoldenDocument(document: string): Report2 {
  if (document.startsWith("baselined/")) {
    return (JSON.parse(readFileSync(join(FIXTURES, document), "utf8")) as { report: Report2 }).report;
  }
  const documents = join(FIXTURES, "schema", "documents");
  const path = document.startsWith("contract/")
    ? join(FIXTURES, document)
    : document.startsWith("report-2/")
      ? join(documents, "corpus", basename(document))
      : join(documents, document);
  const raw = existsSync(path)
    ? readFileSync(path, "utf8")
    : gunzipSync(readFileSync(`${path}.gz`)).toString("utf8");
  return JSON.parse(raw) as Report2;
}

/** The details of a golden's document, by package: only a baselined bundle records them. */
export function pageGoldenMetadata(document: string, pkg: string): RepositoryMetadata | null {
  if (!document.startsWith("baselined/")) return null;
  const { details } = JSON.parse(readFileSync(join(FIXTURES, document), "utf8")) as {
    details: Record<string, { metadata: RepositoryMetadata | null } | undefined>;
  };
  return details[pkg]?.metadata ?? null;
}

export function pageGoldens(): { id: string; golden: PageGolden; report: Report2 }[] {
  const { goldens } = readContractJson("page-goldens.json") as { goldens: Record<string, PageGolden> };
  return Object.entries(goldens).map(([id, golden]) => ({
    id,
    golden,
    report: pageGoldenDocument(golden.document),
  }));
}
