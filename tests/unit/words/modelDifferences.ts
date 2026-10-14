// Where lockrot's hydration of a case differs from the model's inputs, the page's line may differ
// from the model's golden. Each such case is listed, with its reason, in one reviewed file.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ModelGoldens, RecordedCase } from "./recorded";
import { modelCases, recordedCases } from "./recorded";

const FILE = join(process.cwd(), "goldens", "en", "model-differences.json");

type Listed = Record<string, Record<string, string[]>>;

/** The cases a class lists as differing from the model's golden, each with its reason. */
export function listedDifferences(lineClass: string): Map<string, string> {
  const listed = (JSON.parse(readFileSync(FILE, "utf8")) as Listed)[lineClass] ?? {};
  return new Map(
    Object.entries(listed).flatMap(([reason, names]) => names.map((name) => [name, reason] as const)),
  );
}

/** The page writes the Age row without the `age:` prefix of the text formats. */
const withoutAgePrefix = (line: string | null): string | null => line?.replace(/^age: /, "") ?? null;

export interface Difference {
  name: string;
  page: string | null;
  model: string | null;
}

/** The recorded cases whose line is not the model's golden. */
export function differencesFromModel(
  field: keyof Pick<ModelGoldens, "checks" | "branches" | "security_row" | "age_line" | "baseline_suffix">,
  line: (recorded: RecordedCase) => string | null,
): Difference[] {
  const models = new Map(
    modelCases().map(({ name, golden }) => [
      name,
      field === "age_line" ? withoutAgePrefix(golden.age_line) : golden[field],
    ]),
  );
  return recordedCases()
    .filter(({ name }) => models.has(name))
    .map((recorded) => ({
      name: recorded.name,
      page: line(recorded),
      model: models.get(recorded.name) ?? null,
    }))
    .filter(({ page, model }) => page !== model);
}
