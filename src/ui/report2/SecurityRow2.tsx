import { useId } from "preact/hooks";
import type { Finding, RepositoryMetadata, Run } from "../../model/report2";
import { DETAIL_WORDS } from "../../domain/detailWords";
import { moreWaysOut, securityRow, type SecurityRung } from "../../domain/securityLine";
import { TONE } from "../../domain/vocab";
import { toneClass } from "../common/common";
import { DisclosureButton, useDisclosure } from "../common/Disclosure";

export const RUNGS_KEY = "security-rungs";

function Rung({ rung, move, hidden }: { rung: SecurityRung; move: boolean; hidden: boolean }) {
  return (
    <li className={move ? "d2-rung is-move" : "d2-rung"} hidden={hidden} data-branch={rung.branch}>
      <span className="d2-rung-branch">{rung.branch}</span>{" "}
      <span className="d2-rung-clause">
        {rung.clause}
        {rung.after !== null && (
          <>
            {"; "}
            <span className={`d2-after ${toneClass(TONE(rung.afterVerdict ?? ""))}`}>{rung.after}</span>
          </>
        )}
        )
      </span>
    </li>
  );
}

/** The Security row of design 5A: the summary and the first way out at once, the other rungs on click. */
export function SecurityRow2({
  finding,
  run,
  metadata,
}: {
  finding: Finding;
  run: Run;
  metadata: RepositoryMetadata | null;
}) {
  const disclosure = useDisclosure(RUNGS_KEY);
  const listId = `${useId()}-rungs`;
  const { summary, rungs } = securityRow(finding, run, metadata);
  const moveBranch = finding.next_step?.to_branch ?? null;
  const rest = rungs.slice(1);
  return (
    <>
      <p className="d2-row-text">{summary}</p>
      {rungs.length > 0 && (
        <ol className="d2-ladder" id={listId}>
          {rungs.map((rung, i) => (
            <Rung
              key={rung.branch}
              rung={rung}
              move={rung.branch === moveBranch}
              hidden={i > 0 && !disclosure.open}
            />
          ))}
        </ol>
      )}
      {rest.length > 0 && !disclosure.printed && (
        <DisclosureButton
          className="d2-more"
          label={disclosure.open ? DETAIL_WORDS.firstWayOnly : moreWaysOut(rest)}
          open={disclosure.open}
          controls={listId}
          onToggle={disclosure.toggle}
        />
      )}
    </>
  );
}
