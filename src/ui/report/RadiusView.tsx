import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Report2 } from "../../model/report";
import { gradeTone } from "../../domain/findingRow";
import { depthSentence } from "../../domain/overviewBand";
import { applyFilters2, population2 } from "../../domain/list";
import {
  FOLD_SINGLES,
  isRowOpen,
  isSinglesOpen,
  pulledTree,
  rowKey,
  type OpenInput,
} from "../../domain/radius";
import {
  childKey2,
  parentKey2,
  RADIUS_WORDS,
  radiusKeys2,
  radiusAnswer2,
  radiusLayout2,
  radiusRowSay,
  type RadiusFinding2,
  type RadiusLayout2,
  type RadiusRow2,
} from "../../domain/radius2";
import { useReport } from "../context";
import { toneClass } from "../common/common";
import { usePrinted } from "../print/printContext";
import { useNarrow } from "../useWide";
import { firstRows, innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "../rowOpen";
import { FlagPills } from "./FlagPills";
import { useReport2 } from "./useReport";
import "./radius.css";

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
  layout,
  row,
  rank,
  input,
  report,
  first,
}: {
  layout: RadiusLayout2;
  row: RadiusRow2;
  rank: number;
  input: OpenInput;
  report: Report2;
  first: ReadonlySet<string>;
}) {
  const { state, dispatch, cursor } = useReport();
  const canOpen = row.count > 0;
  const open = canOpen && isRowOpen(layout, row, input);
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
          {rank}
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

/** The Blast radius tab of a report-2 document: on screen the depth sentence, the printed summary
 *  holding it on paper; then each direct requirement on `exposure`, in lockrot's order. */
export function RadiusView2() {
  const { state } = useReport();
  const { report } = useReport2();
  const narrow = useNarrow();
  const printed = usePrinted();
  const depth = printed ? null : depthSentence(report);
  const layout = radiusLayout2(report, applyFilters2(report, state, "radius"), population2(report, "radius"));
  const input: OpenInput = { disclosure: state.disclosure, pkg: state.pkg, narrow };
  const first = firstRows(
    radiusKeys2(layout, input),
    (entry) => entry.pkg,
    (entry) => entry.key,
  );
  const rows = (list: readonly RadiusRow2[], from: number) =>
    list.map((row, i) => (
      <ParentRow2
        key={row.package}
        layout={layout}
        row={row}
        rank={from + i}
        input={input}
        report={report}
        first={first}
      />
    ));

  return (
    <section className="radius2" data-surface="radius" aria-label="Blast radius">
      {depth !== null && <p className="r2-depth">{depth}</p>}
      <p className="r2-answer">{radiusAnswer2(layout)}</p>
      {layout.lead.length > 0 && (
        <ul className="r2-list" aria-label={RADIUS_WORDS.list}>
          {rows(layout.lead, 1)}
        </ul>
      )}
      {layout.singles.length > 0 && (
        <Fold
          id={FOLD_SINGLES}
          open={isSinglesOpen(layout, input)}
          head={RADIUS_WORDS.singles(layout.singles.length)}
        >
          <ul className="r2-list">{rows(layout.singles, layout.lead.length + 1)}</ul>
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
