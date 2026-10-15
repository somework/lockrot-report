import type { Finding } from "../model/report2";
import { isScoreGraded } from "../model/report2";

/** The flags a score term names: the join SPEC §7.9.5 asks for, never `flags[].role`. */
export function countedFlagIds(f: Finding): readonly string[] {
  const terms = isScoreGraded(f.score) ? f.score.terms : [];
  return f.flags.map((flag) => flag.id).filter((id) => terms.some((term) => term.flag === id));
}

/** The flags a finding carries that no score term names. */
export function acceptedFlagIds(f: Finding): readonly string[] {
  const counted = countedFlagIds(f);
  return f.flags.map((flag) => flag.id).filter((id) => !counted.includes(id));
}
