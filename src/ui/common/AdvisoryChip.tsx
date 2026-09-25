import type { Finding } from "../../model/types";
import { sevTone, sortAdvisories } from "../../domain/advisories";
import { advisoryChipTitle, worstAdvisory } from "../../domain/advisoryLedger";
import { plural } from "../../domain/format";
import { toneClass } from "./common";
import "./advisory-chip.css";

/** Past this many advisories the chip draws this many squares and a "+". */
const MAX_SQUARES = 5;

/**
 * "▪▪ 2 advisories" on a Findings or All-packages row (PD-ADV-4, DESIGN.md §5): the summary band's
 * own mark — one square per advisory, each in its severity's tone, most severe first — and the
 * count, the chip's border in the worst severity's tone. Its `title` counts them by severity and
 * quotes each fix. Not a control: a click on it opens the row's package like the rest of the row.
 */
export function AdvisoryChip({ finding }: { finding: Finding }) {
  const worst = worstAdvisory(finding);
  if (worst === null) return null;
  const sorted = sortAdvisories(finding.advisories, (advisory) => advisory.severity);
  const squares = sorted.slice(0, MAX_SQUARES);
  return (
    <span className={`adv-chip ${toneClass(sevTone(worst.severity))}`} title={advisoryChipTitle(finding)}>
      <span className="adv-chip-marks" aria-hidden="true">
        {squares.map((advisory, i) => (
          <i key={`${advisory.id}-${i}`} className={toneClass(sevTone(advisory.severity))} />
        ))}
        {sorted.length > MAX_SQUARES && <span className="adv-chip-more">+</span>}
      </span>
      {plural(finding.advisories.length, "advisory", "advisories")}
    </span>
  );
}
