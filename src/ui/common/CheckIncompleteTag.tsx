import "./check-incomplete.css";

/**
 * The toned tag of a run whose advisory check may not have covered every package (PD-ADV-7), on the
 * Advisories tab's answer and on its empty state, so advisories found and none found read as one
 * condition. `mark` is `advisoryCheckMark`'s word.
 */
export function CheckIncompleteTag({ mark }: { mark: string }) {
  return <span className="ci-tag">{mark}</span>;
}
