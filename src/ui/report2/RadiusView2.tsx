import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Report2 } from "../../model/report2";
import { gradeTone } from "../../domain/findingRow2";
import { applyFilters2, population2 } from "../../domain/list2";
import {
  FOLD_OTHER,
  FOLD_SELF,
  FOLD_SINGLES,
  isFoldOpen,
  isRowOpen,
  pulledTree,
  rowKey,
  type OpenInput,
} from "../../domain/radius";
import {
  childKey2,
  parentKey2,
  RADIUS_WORDS,
  radiusKeys2,
  receiptKey2,
  radiusAnswer2,
  radiusLayout2,
  radiusRowSay,
  type RadiusFinding2,
  type RadiusRow2,
} from "../../domain/radius2";
import { useReport } from "../context";
import { toneClass } from "../common/common";
import { useNarrow } from "../useWide";
import { firstRows, innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "../rowOpen";
import { FlagPills } from "./FlagPills";
import { useReport2 } from "./useReport2";
import "./radius2.css";

function Name({ dev, pkg, version }: { dev: boolean; pkg: string; version: string | null }) {
  return (
    <span className="r2-name">
      <b>{pkg}</b>
      {version !== null && <span className="fc-ver"> {version}</span>}
      {dev && <span className="fc-dev">dev</span>}
    </span>
  );
}

interface ChildProps {
  finding: RadiusFinding2;
  depth: number;
  note: string | null;
  report: Report2;
  first: boolean;
}

function ChildRow2({ finding, depth, note, report, first }: ChildProps) {
  const { state, dispatch, cursor } = useReport();
  return (
    <li
      className={`r2-kid ${toneClass(gradeTone(finding.verdict))}`}
      style={{ "--depth": String(depth) }}
      data-pkg={finding.package}
      aria-label={finding.package}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      tabIndex={rowTabIndex(finding.package, cursor, first)}
      {...openInteractions(finding.package, dispatch)}
    >
      <span className="r2-score">{finding.score.total}</span>
      <span className="r2-grade">{finding.verdict}</span>
      <Name dev={finding.dev} pkg={finding.package} version={finding.version} />
      {note !== null && <span className="r2-via">{note}</span>}
      <span className="r2-pills">
        <FlagPills finding={finding} run={report.run} hideAccepted={false} />
      </span>
    </li>
  );
}

function ParentRow2({
  row,
  rank,
  input,
  report,
  expandable,
  first,
}: {
  row: RadiusRow2;
  rank: number | null;
  input: OpenInput;
  report: Report2;
  expandable: boolean;
  first: ReadonlySet<string>;
}) {
  const { state, dispatch, cursor } = useReport();
  const canOpen = expandable && row.count > 0;
  const open = canOpen && isRowOpen(row, input);
  const kidsId = `${useId()}-kids`;
  const toggle = (event: Event) => {
    event.stopPropagation();
    dispatch({ type: "disclose", key: rowKey(row.package), open: !open });
  };
  return (
    <li
      className={open ? "r2-row is-open" : "r2-row"}
      data-pkg={row.package}
      aria-label={row.package}
      aria-current={state.pkg === row.package ? "true" : undefined}
      tabIndex={rowTabIndex(row.package, cursor, first.has(parentKey2(row.package)))}
      {...openInteractions(row.package, dispatch)}
    >
      <div className="r2-line">
        <span className="r2-rank" aria-hidden="true">
          {rank ?? ""}
        </span>
        <span className="r2-head">
          <Name dev={row.dev} pkg={row.package} version={row.version} />
          {row.self !== null && (
            <span className={`r2-self ${toneClass(gradeTone(row.self.verdict))}`}>
              {RADIUS_WORDS.itself(row.self.verdict)}
            </span>
          )}
        </span>
        <span className="r2-say">
          {radiusRowSay(report, row)}
          {row.count > 0 && row.unfiltered > row.count && (
            <span className="r2-also"> {RADIUS_WORDS.filtered(row.unfiltered - row.count)}</span>
          )}
          {row.elsewhere.length > 0 && (
            <span className="r2-also"> {RADIUS_WORDS.elsewhere(row.elsewhere.length)}</span>
          )}
        </span>
        {canOpen && (
          <button
            type="button"
            className="r2-tog"
            aria-expanded={open ? "true" : "false"}
            aria-controls={kidsId}
            aria-label={RADIUS_WORDS.show(row)}
            tabIndex={innerTabIndex(row.package, cursor, first.has(parentKey2(row.package)))}
            onClick={toggle}
          >
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          </button>
        )}
      </div>
      {canOpen && (
        <ul className="r2-kids" id={kidsId} hidden={!open} aria-label={RADIUS_WORDS.listedUnder(row.package)}>
          {open &&
            pulledTree(row).map((node) => (
              <ChildRow2
                key={node.finding.package}
                finding={node.finding}
                depth={node.depth}
                note={node.via.length > 0 ? RADIUS_WORDS.via(node.via) : null}
                report={report}
                first={first.has(childKey2(row.package, node.finding.package))}
              />
            ))}
        </ul>
      )}
    </li>
  );
}

function Fold({
  id,
  open,
  head,
  children,
}: {
  id: string;
  open: boolean;
  head: string;
  children: ComponentChildren;
}) {
  const { dispatch } = useReport();
  const bodyId = `${useId()}-fold`;
  return (
    <section className="r2-fold">
      <button
        type="button"
        className="r2-fold-head"
        aria-expanded={open ? "true" : "false"}
        aria-controls={bodyId}
        onClick={() => {
          dispatch({ type: "disclose", key: id, open: !open });
        }}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> {head}
      </button>
      <div id={bodyId} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}

/** The Blast radius tab of a report-2 document: each direct requirement on `exposure`, most
 *  flagged packages listed under it first, then the tails `radius.ts` lays out. */
export function RadiusView2() {
  const { state } = useReport();
  const { report } = useReport2();
  const narrow = useNarrow();
  const layout = radiusLayout2(report, applyFilters2(report, state, "radius"), population2(report, "radius"));
  const input: OpenInput = { disclosure: state.disclosure, pkg: state.pkg, narrow };
  const first = firstRows(
    radiusKeys2(layout, input),
    (entry) => entry.pkg,
    (entry) => entry.key,
  );
  const rows = (list: readonly RadiusRow2[], from: number, expandable: boolean) =>
    list.map((row, i) => (
      <ParentRow2
        key={row.package}
        row={row}
        rank={expandable ? from + i : null}
        input={input}
        report={report}
        expandable={expandable}
        first={first}
      />
    ));

  return (
    <section className="radius2" data-surface="radius" aria-label="Blast radius">
      <p className="r2-answer">{radiusAnswer2(layout)}</p>
      {layout.lead.length > 0 && (
        <ul className="r2-list" aria-label={RADIUS_WORDS.list}>
          {rows(layout.lead, 1, true)}
        </ul>
      )}
      {layout.singles.length > 0 && (
        <Fold
          id={FOLD_SINGLES}
          open={isFoldOpen(layout, FOLD_SINGLES, input)}
          head={RADIUS_WORDS.singles(layout.singles.length)}
        >
          <ul className="r2-list">{rows(layout.singles, layout.lead.length + 1, true)}</ul>
        </Fold>
      )}
      {layout.selfOnly.length > 0 && (
        <Fold
          id={FOLD_SELF}
          open={isFoldOpen(layout, FOLD_SELF, input)}
          head={RADIUS_WORDS.selfOnly(layout.selfOnly.length)}
        >
          <ul className="r2-list">{rows(layout.selfOnly, 0, false)}</ul>
        </Fold>
      )}
      {layout.receipt.length > 0 && (
        <Fold
          id={FOLD_OTHER}
          open={isFoldOpen(layout, FOLD_OTHER, input)}
          head={RADIUS_WORDS.receipt(layout.receipt.length)}
        >
          <ul className="r2-kids is-flat">
            {layout.receipt.map((entry) => (
              <ChildRow2
                key={entry.finding.package}
                finding={entry.finding}
                depth={0}
                note={RADIUS_WORDS.behind(entry.listedUnder, entry.behind)}
                report={report}
                first={first.has(receiptKey2(entry.finding.package))}
              />
            ))}
          </ul>
        </Fold>
      )}
      {layout.unlisted.length > 0 && (
        <p className="r2-note">
          {RADIUS_WORDS.unlisted(layout.unlisted.length)}: {layout.unlisted.map((f) => f.package).join(", ")}.
        </p>
      )}
      {layout.unattributed.length > 0 && (
        <p className="r2-note">
          {RADIUS_WORDS.shared(layout.unattributed.length)}:{" "}
          {layout.unattributed.map((f) => f.package).join(", ")}.
        </p>
      )}
    </section>
  );
}
