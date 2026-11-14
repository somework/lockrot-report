import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Report2 } from "../../model/report";
import { gradeTone } from "../../domain/findingRow";
import { depthSentence } from "../../domain/overviewBand";
import { applyFilters2, population2, radiusEmpty } from "../../domain/list";
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
  radiusAnswer2,
  radiusTrees2,
  radiusLayout2,
  radiusRowFacts,
  type RadiusFinding2,
  type RadiusKey,
  type RadiusLayout2,
  type RadiusRow2,
} from "../../domain/radius2";
import { useReport } from "../context";
import { RowHint, RowHintContext, toneClass, useRowDescription } from "../common/common";
import { usePrinted } from "../print/printContext";
import { useNarrow } from "../useWide";
import { firstRows, treeStop } from "../rowCursor";
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
  /** Packages are drawn under it, one level deeper. */
  parent: boolean;
  finding: RadiusFinding2;
  depth: number;
  note: string | null;
  report: Report2;
  /** The row is its tree's Tab stop. */
  stop: boolean;
}

function ChildRow2({ finding, depth, parent, note, report, stop }: ChildProps) {
  const { state, dispatch } = useReport();
  const id = useId();
  const described = useRowDescription(`${id}-said`);
  return (
    <li
      role="treeitem"
      aria-level={depth + 2}
      aria-expanded={parent ? "true" : undefined}
      className={`r2-kid ${toneClass(gradeTone(finding.verdict))}`}
      style={{ "--depth": String(depth) }}
      data-pkg={finding.package}
      aria-label={finding.package}
      aria-describedby={described}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      tabIndex={stop ? 0 : -1}
      {...openInteractions(finding.package, dispatch)}
    >
      {/* The description reads words without the CSS capitals of the spans below, which Chromium
          would read out. */}
      <span id={`${id}-said`} hidden>
        score {finding.score.total} {finding.verdict}
      </span>
      <span className="r2-grade">{finding.verdict}</span>
      <span className="r2-score">
        <span className="r2-lbl">score</span> {finding.score.total}
      </span>
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
  stopKey,
}: {
  layout: RadiusLayout2;
  row: RadiusRow2;
  rank: number;
  input: OpenInput;
  report: Report2;
  /** The key of the row that is this tree's Tab stop. */
  stopKey: string | null;
}) {
  const { state, dispatch } = useReport();
  const isStop = stopKey === parentKey2(row.package);
  const printed = usePrinted();
  const canOpen = row.count > 0;
  const open = canOpen && (printed || isRowOpen(layout, row, input));
  const id = useId();
  const kidsId = `${id}-kids`;
  const facts = radiusRowFacts(report, row);
  const own = [
    ...(row.self === null ? [] : [`${id}-self`]),
    ...(facts.count === null ? [] : [`${id}-count`]),
    ...(facts.mix === null && facts.note === null ? [] : [`${id}-mix`]),
  ];
  const described = useRowDescription(...own);
  const toggle = (event: Event) => {
    event.stopPropagation();
    dispatch({ type: "disclose", key: rowKey(row.package), open: !open });
  };
  return (
    <li
      role="treeitem"
      aria-expanded={canOpen ? (open ? "true" : "false") : undefined}
      className={open ? "r2-row is-open" : "r2-row"}
      data-pkg={row.package}
      aria-label={row.package}
      aria-describedby={described}
      aria-current={state.pkg === row.package ? "true" : undefined}
      tabIndex={isStop ? 0 : -1}
      {...openInteractions(row.package, dispatch)}
    >
      <div className="r2-line">
        <span className="r2-rank" aria-hidden="true">
          {rank}
        </span>
        <span className="r2-head">
          <Name dev={row.dev} pkg={row.package} version={row.version} />
          {row.self !== null && (
            <>
              <span className={`r2-self ${toneClass(gradeTone(row.self.verdict))}`}>
                {RADIUS_WORDS.itself(row.self.verdict)}
              </span>
              <span id={`${id}-self`} hidden>
                {RADIUS_WORDS.itself(row.self.verdict)}
              </span>
            </>
          )}
        </span>
        {facts.count !== null && (
          <span className="r2-count" id={`${id}-count`}>
            <span className="r2-n">{facts.count}</span> <span className="r2-unit">flagged</span>
          </span>
        )}
        {(facts.mix !== null || facts.note !== null) && (
          <span className="r2-mix" id={`${id}-mix`}>
            {facts.mix ?? facts.note}
            {row.count > 0 && row.unfiltered > row.count && (
              <span className="r2-also"> · {RADIUS_WORDS.filtered(row.unfiltered - row.count)}</span>
            )}
          </span>
        )}
        {canOpen && (
          <button
            type="button"
            className="r2-tog"
            aria-expanded={open ? "true" : "false"}
            aria-controls={kidsId}
            aria-label={RADIUS_WORDS.show(row)}
            tabIndex={isStop ? undefined : -1}
            onClick={toggle}
          >
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          </button>
        )}
      </div>
      {canOpen && (
        <ul
          className="r2-kids"
          role="group"
          id={kidsId}
          hidden={!open}
          aria-label={RADIUS_WORDS.listedUnder(row.package)}
        >
          {open &&
            pulledTree(row).map((node, i, nodes) => (
              <ChildRow2
                key={node.finding.package}
                finding={node.finding}
                depth={node.depth}
                parent={(nodes[i + 1]?.depth ?? -1) > node.depth}
                note={node.via.length > 0 ? RADIUS_WORDS.via(node.via) : null}
                report={report}
                stop={stopKey === childKey2(row.package, node.finding.package)}
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
  const { state, cursor } = useReport();
  const { report } = useReport2();
  const narrow = useNarrow();
  const printed = usePrinted();
  const empty = radiusEmpty(report);
  const depth = printed ? null : depthSentence(report);
  const all = population2(report, "radius");
  const layout = radiusLayout2(report, applyFilters2(report, state, "radius"), all);
  const answer = radiusAnswer2(report, all);
  const hintId = `${useId()}-hint`;
  const input: OpenInput = { disclosure: state.disclosure, pkg: state.pkg, narrow };
  const trees = radiusTrees2(layout, input);
  const first = firstRows(
    [...trees.lead, ...trees.singles],
    (entry) => entry.pkg,
    (entry) => entry.key,
  );
  const stopOf = (keys: readonly RadiusKey[]) =>
    treeStop(
      keys,
      (entry) => entry.pkg,
      (entry) => entry.key,
      first,
      cursor,
    );
  const rows = (list: readonly RadiusRow2[], from: number, stop: string | null) =>
    list.map((row, i) => (
      <ParentRow2
        key={row.package}
        layout={layout}
        row={row}
        rank={from + i}
        input={input}
        report={report}
        stopKey={stop}
      />
    ));

  if (empty !== null) {
    return (
      <section className="radius2" data-surface="radius" aria-label={RADIUS_WORDS.tab}>
        {!printed && <h2 className="vh">{RADIUS_WORDS.tab}</h2>}
        {!printed && <p className="empty">{empty}</p>}
      </section>
    );
  }

  return (
    <section className="radius2" data-surface="radius" aria-label={RADIUS_WORDS.tab}>
      {!printed && <h2 className="vh">{RADIUS_WORDS.tab}</h2>}
      {depth !== null && <p className="r2-depth">{depth}</p>}
      {answer.length > 0 && <p className="r2-answer">{answer.join(" ")}</p>}
      {(layout.lead.length > 0 || layout.singles.length > 0) && <RowHint id={hintId} />}
      {layout.lead.length > 0 && (
        <ul className="r2-list" role="tree" aria-label={RADIUS_WORDS.list}>
          <RowHintContext.Provider value={hintId}>
            {rows(layout.lead, 1, stopOf(trees.lead))}
          </RowHintContext.Provider>
        </ul>
      )}
      {layout.singles.length > 0 && (
        <Fold
          id={FOLD_SINGLES}
          open={printed || isSinglesOpen(layout, input)}
          head={RADIUS_WORDS.singles(layout.singles.length)}
        >
          <ul className="r2-list" role="tree" aria-label={RADIUS_WORDS.singles(layout.singles.length)}>
            <RowHintContext.Provider value={hintId}>
              {rows(layout.singles, layout.lead.length + 1, stopOf(trees.singles))}
            </RowHintContext.Provider>
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
