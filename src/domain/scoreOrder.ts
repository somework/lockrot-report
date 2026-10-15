/**
 * Findings in the order `run.score_model.sort` publishes: each key by its path, direction and
 * default, the verdict by the order it carries inline. It reproduces `rank`, so a page that
 * re-sorts after a filter cannot drift from the engine.
 */

import type { Finding, ScoreModel } from "../model/report";

export type SortKey = ScoreModel["sort"][number];

function valueAt(finding: unknown, path: string, fallback: SortKey["default"]): unknown {
  let value = finding;
  for (const step of path.split(".")) {
    if (typeof value !== "object" || value === null || !Object.hasOwn(value, step)) return fallback;
    value = (value as Record<string, unknown>)[step];
  }
  return value;
}

const groupOf = (value: unknown, order: readonly (readonly string[])[]): number => {
  const group = order.findIndex((ids) => ids.includes(value as string));
  return group === -1 ? order.length : group;
};

// `<` compares UTF-16 code units, which is PHP's strcmp for the ASCII of a package name.
const byBytes = (a: unknown, b: unknown): number => (a === b ? 0 : (a as string) < (b as string) ? -1 : 1);

function compareBy(key: SortKey, a: unknown, b: unknown): number {
  switch (key.dir) {
    case "order":
      return groupOf(a, key.order ?? []) - groupOf(b, key.order ?? []);
    case "desc":
      return (b as number) - (a as number);
    case "true_first":
      return Number(b === true) - Number(a === true);
    case "asc":
      return byBytes(a, b);
    default:
      return 0;
  }
}

export function sortFindings(findings: readonly Finding[], sort: readonly SortKey[]): Finding[] {
  return [...findings].sort((a, b) => {
    for (const key of sort) {
      const difference = compareBy(key, valueAt(a, key.path, key.default), valueAt(b, key.path, key.default));
      if (difference !== 0) return difference;
    }
    return 0;
  });
}
