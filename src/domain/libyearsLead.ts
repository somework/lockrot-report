/** The Libyears block's lead on Overview (SPEC §7.9.4). */

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

export interface LibyearsLead {
  /** The total to two decimals, or null when no package was measured. */
  readonly figure: string | null;
  /** "at least" when some measured package is a lower bound, else "". */
  readonly bound: string;
  /** "over {n} packages · {d} from direct requirements", or the words for none measured. */
  readonly sub: string;
  /** One clause per unmeasured cause, or null when every package was measured. */
  readonly unmeasured: string | null;
}

/** A cause after its count: a noun phrase, where a reason elsewhere is a clause. */
const unmeasuredWord = (cause: string): string =>
  cause === "branch_snapshot" ? "a branch snapshot with no release branch" : causeWord(cause, "");

/** The Libyears block's lead: one number, then its scope; the furthest package is the table's first row. */
export function libyearsLead({ libyears }: Pick<Report2, "libyears">): LibyearsLead {
  const unmeasured = Object.entries(libyears.unmeasured)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => schemaRank(a) - schemaRank(b))
    .map(([cause, count]) => `${count}, ${unmeasuredWord(cause)}`);
  const tail = unmeasured.length === 0 ? null : `Not measured: ${unmeasured.join(SEPARATOR)}`;
  if (libyears.measured === 0)
    return { figure: null, bound: "", sub: "no package measured", unmeasured: tail };
  return {
    figure: decimal(libyears.total ?? 0, 2),
    bound: libyears.at_least_count > 0 ? "at least" : "",
    sub: [
      `over ${plural(libyears.measured, "package", "packages")}`,
      `${decimal(libyears.direct_requirements ?? 0, 2)} from direct requirements`,
    ].join(SEPARATOR),
    unmeasured: tail,
  };
}
