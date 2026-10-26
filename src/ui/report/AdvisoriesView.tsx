import { Fragment } from "preact";
import type { Run } from "../../model/report";
import {
  ADVISORY_HEAD,
  advisoryAnswer2,
  advisoryBand,
  advisoryFixPhp,
  advisoryFixWords,
  advisoryGroups2,
  advisoryIds,
  advisoryLookupHedge,
  advisoryPairs2,
  advisoryRowLabel2,
  advisoryCountedAs,
  noAdvisoryLine,
  type AdvisoryAnswer2,
  type AdvisoryGroup2,
  type AdvisoryPair2,
} from "../../domain/advisories";
import { advisoryCheckMark } from "../../domain/copySummary";
import { gradeTone, heldByLine, moreWord, reachLine } from "../../domain/findingRow";
import { advisoryAffects } from "../../domain/securityBlock";
import { applyFilters2, population2 } from "../../domain/list";
import { day, plural } from "../../domain/format";
import type { Report2 } from "../../model/report";
import { EMPTY_FILTERS } from "../../state/types";
import { useReport } from "../context";
import { toneClass } from "../common/common";
import { CheckIncompleteTag } from "../common/CheckIncompleteTag";
import { CleanMark } from "../ledger/CleanMark";
import { firstRows, innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "../rowOpen";
import { usePrinted } from "../print/printContext";
import { EmptyState } from "../views/EmptyState";
import { SecurityBlock } from "./Overview";
import { PackageWord, Version } from "./PackageWord";
import { useReport2 } from "./useReport";
import "../views/views.css";
import "../views/advisories.css";
import "./advisories.css";

const pairKey = ({ finding, row }: AdvisoryPair2): string => `${finding.package}:${row.id}`;

/** The CVE as text; the advisory's own `link`, as lockrot gives it, on its id. */
function Ids({
  pair,
  sameAs,
  tabIndex,
}: {
  pair: AdvisoryPair2;
  sameAs: string | null;
  tabIndex: -1 | undefined;
}) {
  const { row } = pair;
  return (
    <span className="ac-ids">
      {advisoryIds(row).map(({ text, href, noCve }) =>
        noCve ? (
          <span key={text} className="ac-nocve">
            {text}
          </span>
        ) : href !== null ? (
          <a
            key={text}
            className="ac-id lnk"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={tabIndex}
          >
            {text}
          </a>
        ) : (
          <span key={text} className="ac-id">
            {text}
          </span>
        ),
      )}
      {sameAs !== null && (
        <span className="ac-same">
          {ADVISORY_HEAD.sameAs} <span className="ac-id">{sameAs}</span>
        </span>
      )}
      {row.reported_at !== null && (
        <span className="ac-reported">
          {ADVISORY_HEAD.reported} {day(row.reported_at)}
        </span>
      )}
    </span>
  );
}

/** Severity, Advisory, Affects, Fixed by: the cells of a row, in order. */
const ADVISORY_COLUMNS = 4;

/** A long range folds behind its count; the fold is a native disclosure the keyboard opens. On
 *  paper, where nothing opens, every range prints under its count. */
function Affects({ range, tabIndex }: { range: string | null; tabIndex: -1 | undefined }) {
  const printed = usePrinted();
  const affects = advisoryAffects(range);
  if (printed && affects?.folded != null) {
    return (
      <span className="ac-aff" role="cell">
        <span className="ac-lbl" aria-hidden="true">
          {ADVISORY_HEAD.affects}{" "}
        </span>
        <span className="ac2-count">{affects.folded}</span>
        {/* One line that wraps only after a range's own `|`. */}
        <span className="mono ac2-range ac2-flow">
          {affects.parts.map((part, i) => (
            <Fragment key={i}>
              <span className="ac2-r">{part}</span>
              <wbr />
            </Fragment>
          ))}
        </span>
      </span>
    );
  }
  return (
    <span className="ac-aff" role="cell">
      <span className="ac-lbl" aria-hidden="true">
        {ADVISORY_HEAD.affects}{" "}
      </span>
      {affects === null ? (
        <span className="mono">?</span>
      ) : affects.folded === null ? (
        <span className="mono ac2-range">{affects.range}</span>
      ) : (
        <details className="ac2-fold" data-no-open>
          <summary tabIndex={tabIndex}>{affects.folded}</summary>
          <span className="mono ac2-range">
            {affects.parts.map((part, i) => (
              <span key={i} className="ac2-part">
                {part}
              </span>
            ))}
          </span>
        </details>
      )}
    </span>
  );
}

function AdvisoryRow2({
  pair,
  run,
  first,
  sameAs,
}: {
  pair: AdvisoryPair2;
  run: Run;
  first: boolean;
  sameAs: string | null;
}) {
  const { state, dispatch, cursor } = useReport();
  const { finding, row } = pair;
  const fix = advisoryFixWords(row.fix, finding);
  const countedAs = advisoryCountedAs(run, row.severity);
  const php = advisoryFixPhp(row.fix);
  const held = heldByLine(row.fix.held_by, run, finding.package);
  const inner = innerTabIndex(finding.package, cursor, first);
  return (
    <div
      role="row"
      tabIndex={rowTabIndex(finding.package, cursor, first)}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      aria-label={advisoryRowLabel2(pair)}
      data-pkg={finding.package}
      className={`adv ${toneClass(gradeTone(advisoryBand(run, row.severity)))}`}
      {...openInteractions(finding.package, dispatch)}
    >
      <span className="ac-sev" role="cell">
        <span className="ac-lbl ac-sev-lbl" aria-hidden="true">
          {ADVISORY_HEAD.sev}{" "}
        </span>
        {row.severity}
        {countedAs !== null && <span className="ac-counted">{countedAs.replace(/^, /, "")}</span>}
      </span>
      {/* One cell under the Advisory head: the title and the ids keep grid places of their own. */}
      <span className="ac-adv" role="cell">
        <span className="ac-title">{row.title ?? row.id}</span>
        <Ids pair={pair} sameAs={sameAs} tabIndex={inner} />
      </span>
      <Affects range={row.affected_versions} tabIndex={inner} />
      <span className={fix.version === null ? "ac-fix is-none" : "ac-fix"} role="cell">
        {fix.version !== null && (
          <>
            <span className="ac-lbl" aria-hidden="true">
              {ADVISORY_HEAD.fixedBy}{" "}
            </span>
            <span className="ac-fixver">{fix.version}</span>{" "}
          </>
        )}
        <span className="ac-where">{fix.where}</span>
        {(php !== null || held !== null) && (
          <span className="ac2-note">
            {php}
            {php !== null && held !== null && " · "}
            {held !== null && (
              <>
                held by <PackageWord name={held.name} />
                {held.more > 0 && <span className="f2-more"> {moreWord(held.more)}</span>}
              </>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

function Group({ group, run, first }: { group: AdvisoryGroup2; run: Run; first: ReadonlySet<string> }) {
  const { finding } = group;
  const reach = reachLine(finding);
  return (
    <section className={`advgroup ${toneClass(gradeTone(finding.verdict))}`}>
      <div className="al-group-head" role="row">
        <span className="al-span-cell" role="cell" aria-colspan={ADVISORY_COLUMNS}>
          <h2>
            {finding.package} <Version version={finding.version} className="ac-ver" />
          </h2>
          <span className="al-group-count">{plural(group.pairs.length, "advisory", "advisories")}</span>
          <span className="al-group-reach">
            {reach.lead}
            {reach.through !== null && (
              <>
                {" "}
                <PackageWord name={reach.through} />
              </>
            )}
            {reach.more > 0 && <span className="f2-more"> {moreWord(reach.more)}</span>}
            {reach.dev && " · dev"}
          </span>
        </span>
      </div>
      <div className="adv-list" role="rowgroup" aria-label={`${finding.package} advisories`}>
        {group.pairs.map((pair, i) => (
          <AdvisoryRow2
            key={pairKey(pair)}
            pair={pair}
            run={run}
            first={first.has(pairKey(pair))}
            sameAs={group.sameAs[i] ?? null}
          />
        ))}
      </div>
    </section>
  );
}

/** `marked` draws the clean mark, which on screen the Security block above already carries. */
function NoAdvisories2({ marked }: { marked: boolean }) {
  const { report } = useReport2();
  const line = noAdvisoryLine(report);
  const mark = advisoryCheckMark(report);
  if (mark !== null) {
    return (
      <div className="empty al-empty">
        <CheckIncompleteTag mark={mark} />
        <p className="al-answer">{line}</p>
      </div>
    );
  }
  return (
    <div className="empty al-empty">
      <p className={`al-answer al-clean ${toneClass("none")}`}>
        {marked && <CleanMark size={20} />}
        <span>{line}</span>
      </p>
    </div>
  );
}

/** The tab's answer and lookup hedge. `counted` drops the severities, which the unfiltered chips
 *  beside it count. */
function Answer({ report, answer, counted }: { report: Report2; answer: AdvisoryAnswer2; counted: boolean }) {
  const hedge = advisoryLookupHedge(report);
  const mark = advisoryCheckMark(report);
  return (
    <>
      <p className="al-answer">{counted ? answer.head : answer.text}</p>
      {hedge !== null && mark !== null && (
        <p className="al-partial">
          <CheckIncompleteTag mark={mark} /> <span>{hedge}</span>
        </p>
      )}
      {answer.narrowed !== null && <p className="al-scope">{answer.narrowed}</p>}
    </>
  );
}

/** The Advisories tab of a report-2 document: on screen the Security block with the tab's answer,
 *  on paper the answer alone (the printed summary holds the block); then every S9 row, grouped by
 *  the fix it takes. Rows keep `applyFilters2` order inside a group. */
export function AdvisoriesView2() {
  const { state } = useReport();
  const { report } = useReport2();
  const printed = usePrinted();
  const { run } = report;
  if (population2(report, "advisories").length === 0)
    return (
      <section className="advisories2" data-surface="advisories" aria-label="Advisories">
        {!printed && (
          <div className="al-lead">
            <SecurityBlock report={report} />
          </div>
        )}
        <NoAdvisories2 marked={printed} />
      </section>
    );

  const pairs = advisoryPairs2(applyFilters2(report, state, "advisories"), state.filters);
  const unfiltered = advisoryPairs2(population2(report, "advisories"), EMPTY_FILTERS).length;
  const groups = advisoryGroups2(pairs);
  const answer = advisoryAnswer2(run, pairs, unfiltered);
  const shown = groups.flatMap((group) => group.pairs);
  const first = firstRows(shown, (pair) => pair.finding.package, pairKey);
  const listed = groups.length > 0;

  return (
    <section className="advisories2" data-surface="advisories" aria-label="Advisories">
      {!printed && (
        <div className="al-lead">
          <SecurityBlock
            report={report}
            answer={
              listed ? (
                <Answer report={report} answer={answer} counted={answer.narrowed === null} />
              ) : undefined
            }
          />
        </div>
      )}
      {!listed ? (
        <EmptyState reason="filtered" />
      ) : (
        <>
          {printed && (
            <div className="al-top">
              <Answer report={report} answer={answer} counted={false} />
            </div>
          )}
          <div className="aledger no-axis" role="table" aria-label="Advisories">
            <div className="al-head" role="row">
              <span className="al-col al-col-sev" role="columnheader">
                {ADVISORY_HEAD.sev}
              </span>
              <span className="al-col al-col-adv" role="columnheader">
                {ADVISORY_HEAD.adv}
              </span>
              <span className="al-col al-col-aff" role="columnheader">
                {ADVISORY_HEAD.aff}
              </span>
              <span className="al-col al-col-fix" role="columnheader">
                {ADVISORY_HEAD.fix}
              </span>
            </div>
            {groups.map((group) => (
              <Group key={group.finding.package} group={group} run={run} first={first} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
