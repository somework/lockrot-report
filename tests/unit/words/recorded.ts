// What lockrot recorded at the pinned commit, read the way the page reads it: a report-2 document,
// and the details of its one package (DESIGN.md §7).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Finding, Report2, RepositoryMetadata, Run } from "../../../src/model/report2";

const FIXTURES = join(process.cwd(), ".lockrot", "tests", "fixtures");
const CONTRACT = join(FIXTURES, "contract");

/** The strings lockrot's PHP grammars own, one object per case (`goldens/<case>.json`). */
export interface PhpGoldens {
  age_line: string | null;
  baseline_suffix: string | null;
  commands_posix: string[];
  commands_cmd: string[];
}

/** The model's strings for one case (`flags/cases.json`), the reference of the first recording only. */
export interface ModelGoldens extends PhpGoldens {
  checks: string;
  branches: string | null;
  security_row: string;
}

export interface RecordedCase {
  name: string;
  report: Report2;
  finding: Finding;
  run: Run;
  metadata: RepositoryMetadata | null;
  php: PhpGoldens | null;
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
  if (!existsSync(join(CONTRACT, "explain-2", `${name}.json`))) return null;
  return (readContractJson("explain-2", `${name}.json`) as { metadata: RepositoryMetadata | null }).metadata;
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
      };
    })
    .filter(({ report }) => report.findings.length === 1);
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
