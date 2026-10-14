// lockrot's recorded cases: each report-2 document of the bundle beside the model's case of the same id.
import { join } from "node:path";
import type { Finding, Report2, Run } from "../../../src/model/report2";
import { readJson, reportDocuments } from "../model/lockrotContract";

export interface ModelGolden {
  answer: string;
  why: string[];
}

export interface RecordedCase {
  id: string;
  report: Report2;
  finding: Finding;
  /** The model's own document: lockrot could not hydrate the case, so it did not record it. */
  modelOnly: boolean;
  model: ModelGolden;
}

/** A case of the model: its own finding and run, beside the strings it renders from them. */
export interface ModelCase {
  id: string;
  finding: Finding;
  run: Run;
  golden: ModelGolden;
}

export function modelCases(): ModelCase[] {
  const path = join(process.cwd(), ".lockrot", "tests", "fixtures", "flags", "cases.json");
  return (readJson(path) as { cases: ModelCase[] }).cases;
}

const FILE_ID = /^contract\/(report-2|model-only)\/(.+)\.json$/;

/** Every case of `flags/cases.json`, in its order; a document no case names (the composite) is left out. */
export function recordedCases(): RecordedCase[] {
  const cases = modelCases();
  const documents = new Map(
    reportDocuments().map(({ name, document }) => {
      const [, dir, stem] = FILE_ID.exec(name) ?? [];
      return [
        stem?.replace(/-dagger$/, "‡"),
        { report: document as Report2, modelOnly: dir === "model-only" },
      ];
    }),
  );
  return cases.map(({ id, golden }) => {
    const recorded = documents.get(id);
    const finding = recorded?.report.findings[0];
    if (!recorded || !finding) throw new Error(`case ${id} has no recorded document`);
    return { id, report: recorded.report, finding, modelOnly: recorded.modelOnly, model: golden };
  });
}

/** `{case id: value}` as a file snapshot writes it: two-space JSON and a final newline. */
export function goldenFile(values: Record<string, unknown>): string {
  return `${JSON.stringify(values, null, 2)}\n`;
}
