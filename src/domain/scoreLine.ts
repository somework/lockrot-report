/**
 * The score line (`ScoreText`, score text grammar 1), written from the fields of a score alone:
 * `32 = vulnerable 32 [critical advisory]`. `score.text` is lockrot's copy of it, a tooltip only.
 */

import type { Modifier, Score, Term, TermMaintenance, TermSecurity } from "../model/report2";
import { isScoreGraded, isTermSecurity } from "../model/report2";
import { shareGlyph } from "./pageVocabulary";

const isPrinted = ({ before, after }: Modifier): boolean => before !== after;

function maintenanceTerm({ flag, role, points, weight, divisor }: TermMaintenance): string {
  return role === "corroborating"
    ? `${flag} ${points} [${shareGlyph({ num: 1, den: divisor })} of ${weight}]`
    : `${flag} ${points}`;
}

function securityTerm({ points, severity, multiplier, weight }: TermSecurity): string {
  const noReachableFix = multiplier === 2 ? ` ${weight} × 2: no reachable fix` : "";
  return `vulnerable ${points} [${severity} advisory${noReachableFix}]`;
}

const halving = ({ divide_by: divideBy, reason }: Modifier): string => `÷ ${divideBy} ${reason}`;

function acceptedTail(score: Score): string {
  return score.accepted.length === 0
    ? ""
    : ` (${score.accepted.map(({ flag }) => flag).join(", ")} accepted)`;
}

export function scoreLine(score: Score): string {
  if (!isScoreGraded(score) || score.terms.length === 0) return `0${acceptedTail(score)}`;

  const security = score.terms.find((term: Term): term is TermSecurity => isTermSecurity(term));
  const maintenance = score.terms.filter((term): term is TermMaintenance => !isTermSecurity(term));
  const reach = score.modifiers.find(
    (modifier) => modifier.applies_to === "maintenance" && isPrinted(modifier),
  );
  const dev = score.modifiers.find((modifier) => modifier.applies_to === "total" && isPrinted(modifier));

  const maintenanceText = maintenance.map(maintenanceTerm).join(" + ");
  const reachText =
    reach === undefined
      ? maintenanceText
      : `${maintenance.length > 1 ? `(${maintenanceText})` : maintenanceText} ${halving(reach)}`;
  const body = [
    maintenance.length > 0 ? reachText : null,
    security === undefined ? null : securityTerm(security),
  ]
    .filter((part) => part !== null)
    .join(" + ");

  const isAtom = reach === undefined && maintenance.length + (security === undefined ? 0 : 1) === 1;
  const withDev = dev === undefined ? body : `${isAtom ? body : `(${body})`} ${halving(dev)}`;
  const rounded = score.rounded_down ? ` (${score.exact}, rounded down)` : "";

  return `${score.total} = ${withDev}${rounded}${acceptedTail(score)}`;
}
