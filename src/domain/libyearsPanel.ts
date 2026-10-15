/**
 * The Libyears panel of the Overview as text (SPEC §7.9.6): the total, the direct requirements' share,
 * the package furthest behind and one clause per unmeasured cause, joined by " · ".
 */

import type { Report2 } from "../model/report";
import { decimal, plural } from "./format";
import { causeWord } from "./pageVocabulary";

const SEPARATOR = " · ";

/** The schema's key order of `libyears.unmeasured`. A later key is a count too, and follows these. */
const UNMEASURED_ORDER: readonly string[] = [
  "not_from_composer_repository",
  "unavailable",
  "not_found",
  "branch_snapshot",
  "shared_commit",
  "undated",
  "no_stable_release",
  "undated_releases",
];

const schemaRank = (cause: string): number => {
  const rank = UNMEASURED_ORDER.indexOf(cause);
  return rank === -1 ? UNMEASURED_ORDER.length : rank;
};

function measuredParts({ libyears }: Pick<Report2, "libyears">): string[] {
  if (libyears.measured === 0) return ["no package measured"];
  const bound = libyears.at_least_count > 0 ? "at least " : "";
  const worst = libyears.furthest_behind;
  return [
    `${bound}${decimal(libyears.total ?? 0, 2)} libyears over ${plural(libyears.measured, "package", "packages")}`,
    `${decimal(libyears.direct_requirements ?? 0, 2)} from direct requirements`,
    ...(worst === null
      ? []
      : [
          `furthest behind: ${worst.package} ${worst.version}, ${decimal(worst.libyears, 2)}${worst.at_least ? " or more" : ""}`,
        ]),
  ];
}

export function libyearsPanel(report: Pick<Report2, "libyears">): string {
  const unmeasured = Object.entries(report.libyears.unmeasured)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => schemaRank(a) - schemaRank(b))
    .map(([cause, count]) => `${count} not measured (${causeWord(cause, "")})`);
  return [...measuredParts(report), ...unmeasured].join(SEPARATOR);
}
