import type { Run } from "../../model/report";
import {
  ADVISORY_HEAD,
  advisoryAnswer2,
  advisoryBand,
  advisoryFixNote,
  advisoryFixWords,
  advisoryGroups2,
  advisoryLookupHedge,
  advisoryPairs2,
  advisoryRowLabel2,
  advisoryCountedAs,
  noAdvisoryLine,
  type AdvisoryAnswer2,
  type AdvisoryGroup2,
  type AdvisoryPair2,
} from "../../domain/advisories";
import { gradeTone, reachWord } from "../../domain/findingRow";
import { applyFilters2, population2 } from "../../domain/list";
import { cveUrl, safeHref } from "../../domain/links";
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
import { useReport2 } from "./useReport";
import "../views/views.css";
import "../views/advisories.css";
import "./advisories.css";

const pairKey = ({ finding, row }: AdvisoryPair2): string => `${finding.package}:${row.id}`;

function Ids({ pair, tabIndex }: { pair: AdvisoryPair2; tabIndex: -1 | undefined }) {
  const { row } = pair;
  const cve = cveUrl(row);
  const link = safeHref(row.link);
  const showId = row.cve === null || row.id !== row.cve;
  return (
    <span className="ac-ids">
      {cve !== null ? (
        <a className="ac-id lnk" href={cve} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}>
          {row.cve}
        </a>
      ) : row.cve !== null ? (
        <span className="ac-id">{row.cve}</span>
      ) : (
        <span className="ac-nocve">{ADVISORY_HEAD.noCve}</span>
      )}
      {showId &&
        (link !== null ? (
          <a className="ac-id lnk" href={link} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}>
            {row.id}
          </a>
        ) : (
          <span className="ac-id">{row.id}</span>
        ))}
      {row.reported_at !== null && (
        <span className="ac-reported">
          {ADVISORY_HEAD.reported} {day(row.reported_at)}
        </span>
      )}
    </span>
  );
}

function AdvisoryRow2({ pair, run, first }: { pair: AdvisoryPair2; run: Run; first: boolean }) {
  const { state, dispatch, cursor } = useReport();
  const { finding, row } = pair;
  const fix = advisoryFixWords(row.fix, finding);
  const countedAs = advisoryCountedAs(run, row.severity);
  const note = advisoryFixNote(row.fix);
  return (
    <li
      tabIndex={rowTabIndex(finding.package, cursor, first)}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      aria-label={advisoryRowLabel2(pair)}
      data-pkg={finding.package}
      className={`adv ${toneClass(gradeTone(advisoryBand(run, row.severity)))}`}
      {...openInteractions(finding.package, dispatch)}
    >
      <span className="ac-sev" title={countedAs === null ? undefined : `${row.severity}${countedAs}`}>
        {row.severity}
        {countedAs !== null && <span className="vh">{countedAs}</span>}
      </span>
      <span className="ac-title">{row.title ?? row.id}</span>
      <Ids pair={pair} tabIndex={innerTabIndex(finding.package, cursor, first)} />
      <span className="ac-pkg">
        <span className="ac-name" title={`${finding.package} ${finding.version}`}>
          <b>{finding.package}</b> <span className="ac-ver">{finding.version}</span>
        </span>
        <span className="ac-reach">{reachWord(finding)}</span>
      </span>
      <span className="ac-aff">
        <span className="ac-lbl">{ADVISORY_HEAD.affects} </span>
        <span className="mono ac2-range" title={row.affected_versions ?? undefined}>
          {row.affected_versions ?? "?"}
        </span>
      </span>
      <span className={fix.version === null ? "ac-fix is-none" : "ac-fix"}>
        {fix.version !== null && (
          <>
            <span className="ac-lbl">{ADVISORY_HEAD.fixedBy} </span>
            <span className="ac-fixver">{fix.version}</span>{" "}
          </>
        )}
        <span className="ac-where">{fix.where}</span>
        {note !== null && <span className="ac2-note">{note}</span>}
      </span>
    </li>
  );
}

function Group({ group, run, first }: { group: AdvisoryGroup2; run: Run; first: ReadonlySet<string> }) {
  return (
    <section className={`advgroup is-${group.kind}`}>
      <header className="al-group-head">
        <h2>{group.heading}</h2>
        <span className="al-group-count">{plural(group.pairs.length, "advisory", "advisories")}</span>
      </header>
      <ul className="adv-list" aria-label={group.heading}>
        {group.pairs.map((pair) => (
          <AdvisoryRow2 key={pairKey(pair)} pair={pair} run={run} first={first.has(pairKey(pair))} />
        ))}
      </ul>
    </section>
  );
}

function NoAdvisories2() {
  const { report } = useReport2();
  const line = noAdvisoryLine(report);
  if (advisoryLookupHedge(report) !== null) {
    return (
      <div className="empty al-empty">
        <CheckIncompleteTag />
        <p className="al-answer">{line}</p>
      </div>
    );
  }
  return (
    <div className="empty al-empty">
      <p className={`al-answer al-clean ${toneClass("none")}`}>
        <CleanMark size={20} />
        <span>{line}</span>
      </p>
    </div>
  );
}

/** The tab's answer and lookup hedge; `counted` drops the severities the chips beside it count. */
function Answer({ report, answer, counted }: { report: Report2; answer: AdvisoryAnswer2; counted: boolean }) {
  const hedge = advisoryLookupHedge(report);
  return (
    <>
      <p className="al-answer">{counted ? answer.head : answer.text}</p>
      {hedge !== null && (
        <p className="al-partial">
          <CheckIncompleteTag /> <span>{hedge}</span>
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
        <NoAdvisories2 />
      </section>
    );

  const pairs = advisoryPairs2(applyFilters2(report, state, "advisories"), state.filters);
  const unfiltered = advisoryPairs2(population2(report, "advisories"), EMPTY_FILTERS).length;
  const groups = advisoryGroups2(run, pairs);
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
            answer={listed ? <Answer report={report} answer={answer} counted /> : undefined}
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
          <div className="aledger no-axis">
            <div className="al-head" aria-hidden="true">
              <span className="al-col al-col-sev">{ADVISORY_HEAD.sev}</span>
              <span className="al-col al-col-adv">{ADVISORY_HEAD.adv}</span>
              <span className="al-col al-col-pkg">{ADVISORY_HEAD.pkg}</span>
              <span className="al-col al-col-aff">{ADVISORY_HEAD.aff}</span>
              <span className="al-col al-col-fix">{ADVISORY_HEAD.fix}</span>
            </div>
            {groups.map((group) => (
              <Group key={`${group.kind}:${group.toBranch ?? ""}`} group={group} run={run} first={first} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
