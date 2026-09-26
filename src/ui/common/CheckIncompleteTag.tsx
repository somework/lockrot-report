import "./check-incomplete.css";

/**
 * The one name the page gives a run whose advisory check may not have covered every package
 * (`advisoryCheckIncomplete`, PD-ADV-7): the same toned tag in the summary band, on the Advisories
 * tab's answer and on its empty state, so the two cases — advisories found, and none found — never
 * read as two different conditions.
 */
export function CheckIncompleteTag() {
  return <span className="ci-tag">Check incomplete</span>;
}
