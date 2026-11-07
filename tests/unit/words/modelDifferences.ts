// Where lockrot's hydration of a case differs from the model's inputs, the page's line may differ
// from the model's golden. Each such case is listed, with its reason, in one reviewed file.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ModelGoldens, RecordedCase } from "./recorded";
import { lockrotRecordings, modelCases } from "./recorded";

const FILE = join(process.cwd(), "goldens", "en", "model-differences.json");

type Listed = Record<string, Record<string, Record<string, string[]>>>;

function listedOf(lineClass: string): [reason: string, name: string, fields: string[]][] {
  const listed = (JSON.parse(readFileSync(FILE, "utf8")) as Listed)[lineClass] ?? {};
  return Object.entries(listed).flatMap(([reason, cases]) =>
    Object.entries(cases).map(([name, fields]) => [reason, name, fields] as [string, string, string[]]),
  );
}

/** The cases a class lists as differing from the model's golden, each with its reason. */
export function listedDifferences(lineClass: string): Map<string, string> {
  return new Map(listedOf(lineClass).map(([reason, name]) => [name, reason]));
}

/** The fields a class lists as differing, by case. */
export function listedFields(lineClass: string): Record<string, string[]> {
  return Object.fromEntries(listedOf(lineClass).map(([, name, fields]) => [name, fields]));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The JSON pointers at which two values differ: each differing leaf, and "/" for a whole line. */
export function differingFields(page: unknown, model: unknown, at = ""): string[] {
  if (isRecord(page) && isRecord(model)) {
    const keys = [...new Set([...Object.keys(page), ...Object.keys(model)])].sort();
    return keys.flatMap((key) => differingFields(page[key], model[key], `${at}/${key}`));
  }
  if (Array.isArray(page) && Array.isArray(model)) {
    const length = Math.max(page.length, model.length);
    return Array.from({ length }, (_, i) => differingFields(page[i], model[i], `${at}/${i}`)).flat();
  }
  return JSON.stringify(page) === JSON.stringify(model) ? [] : [at === "" ? "/" : at];
}

/** Whether two lines or blocks differ in any field, whatever their key order. */
export const differs = (page: unknown, model: unknown): boolean => differingFields(page, model).length > 0;

/** Each differing case with the fields at which it differs, in the shape of `listedFields`. */
export function fieldsOf(differences: readonly Difference[]): Record<string, string[]> {
  return Object.fromEntries(differences.map(({ name, page, model }) => [name, differingFields(page, model)]));
}

export interface Difference {
  name: string;
  page: unknown;
  model: unknown;
}

/** The cases lockrot recorded whose line or block is not the model's golden. */
export function differencesFromModel(
  field: keyof Omit<ModelGoldens, "why" | "commands_posix" | "commands_cmd" | "age_line">,
  line: (recorded: RecordedCase) => unknown,
): Difference[] {
  const models = new Map(modelCases().map(({ name, golden }) => [name, golden[field]]));
  return lockrotRecordings()
    .filter(({ name }) => models.has(name))
    .map((recorded) => ({
      name: recorded.name,
      page: line(recorded),
      model: models.get(recorded.name) ?? null,
    }))
    .filter(({ page, model }) => differs(page, model));
}
