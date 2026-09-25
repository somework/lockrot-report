import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Finding } from "../../model/types";
import { applyFilters, population } from "../../domain/filters";
import { ageAxis } from "../../domain/age";
import { plural } from "../../domain/format";
import {
  FOLD_OTHER,
  FOLD_SELF,
  FOLD_SINGLES,
  isFoldOpen,
  isRowOpen,
  pulledTree,
  radiusAnswer,
  radiusLayout,
  rowKey,
  vendorPhrase,
  verdictMix,
  type OpenInput,
  type RadiusAnswer as Answer,
  type RadiusLayout,
  type RadiusRow,
} from "../../domain/radius";
import { useReport } from "../context";
import { firstRows } from "../rowCursor";
import { useNarrow } from "../useWide";
import { AgeAxis as AgeAxisHead } from "./AgeScale";
import { joined, MixWords, squaresWidth, VerdictWord } from "./RadiusMarks";
import { childKey, parentKey, ParentRow, receiptKey, ReceiptRow, type RowEnv } from "./RadiusRows";
import "./views.css";
import "./ledger-rows.css";
import "./radius.css";

/** How long the packages a jump lands on stay marked. */
const FLASH_MS = 1800;

function Pk({ name }: { name: string }) {
  return <span className="rl-pk">{name}</span>;
}

/**
 * The tab's answer, first (PD-RADIUS-1): the fewest rows that hold half of what is listed, by name
 * and count, against every flagged package listed and every direct requirement — "wallabag/rulerz
 * (14) and phpunit/phpunit (13) pull in 27 of the 49 flagged packages that sit under 17 of your 29
 * direct requirements." Counts only. Under a filter every count is of the packages that match it,
 * and the sentence says "matching" (PD-RADIUS-6).
 */
function AnswerSentence({ answer, id, narrowed }: { answer: Answer; id: string; narrowed: boolean }) {
  const { top, held, total, rows, exposureCount } = answer;
  const lead = top[0];
  if (lead === undefined) return null;
  const flagged = narrowed ? "matching flagged" : "flagged";
  if (rows === 1) {
    return (
      <p className="rl-answer" id={id}>
        {exposureCount === 1 ? (
          <>
            <Pk name={lead.package} />, your one direct requirement, pulls in <b>{lead.count}</b> {flagged}{" "}
            {lead.count === 1 ? "package" : "packages"}.
          </>
        ) : (
          <>
            <Pk name={lead.package} /> is the only one of your <b>{exposureCount}</b> direct requirements with{" "}
            {flagged} packages under it: <b>{lead.count}</b>.
          </>
        )}
      </p>
    );
  }
  const names = joined(
    top.map((row) => (
      <span key={row.package} className="fl-unit">
        <Pk name={row.package} /> (<b>{row.count}</b>)
      </span>
    )),
  );
  const verb = top.length === 1 ? "pulls in" : "pull in";
  return (
    <p className="rl-answer" id={id}>
      {top.length === 1 ? <Pk name={lead.package} /> : names} {verb}{" "}
      {held === total ? (
        <>
          all <b>{total}</b> {flagged} packages
        </>
      ) : (
        <>
          <b>{held}</b> of the <b>{total}</b> {flagged} packages
        </>
      )}{" "}
      that sit under <b>{rows}</b> of your <b>{exposureCount}</b> direct requirements.
    </p>
  );
}

/** Under a filter, what the counts cover and what they are without it: "Only flagged packages that
 *  match the filter are counted. Without it, 49 sit under 17 of your 29 direct requirements." */
function ScopeNote({ layout }: { layout: RadiusLayout }) {
  if (!layout.narrowed) return null;
  return (
    <p className="rl-scope">
      Only flagged packages that match the filter are counted.
      {layout.unfilteredTotal > 0 && (
        <>
          {" "}
          Without it, <b>{layout.unfilteredTotal}</b> sit under <b>{layout.unfilteredRows}</b> of your{" "}
          <b>{layout.exposureCount}</b> direct requirements.
        </>
      )}
    </p>
  );
}

/** The key under the answer: what a square is and what the hollow one is. Two short items, so a
 *  phone keeps it to two lines; "one square size on every row" is in each squares cell's title. */
function Key({ hollow }: { hollow: boolean }) {
  return (
    <p className="rl-key" aria-hidden="true">
      <span className="rl-key-item">
        <i className="rl-u tone-crit" />
        <i className="rl-u tone-high" />
        <i className="rl-u tone-med" />
        <i className="rl-u tone-low" />a flagged package under the row, by priority
      </span>
      {hollow && (
        <span className="rl-key-item">
          <i className="rl-u is-else" />
          +N reached too, listed under another row
        </span>
      )}
    </p>
  );
}

function Head({ axis }: { axis: ReturnType<typeof ageAxis> }) {
  return (
    <div className="rl-head">
      <span className="rl-h rl-h-rank" aria-hidden="true">
        #
      </span>
      <span className="rl-h rl-h-pkg" aria-hidden="true">
        Direct requirement
        <span className="rl-h-narrow"> · flagged under it · what it pulls in</span>
      </span>
      <span className="rl-h rl-h-sq" aria-hidden="true">
        Flagged underneath
      </span>
      <span className="rl-h rl-h-say" aria-hidden="true">
        What it pulls in
      </span>
      {axis ? <AgeAxisHead axis={axis} /> : <span className="fhead-age" />}
    </div>
  );
}

/** A fold's head: a button over its rows, its sentence the fold's whole summary. */
function FoldHead({
  id,
  controls,
  open,
  rank,
  children,
  sub,
  onToggle,
}: {
  id: string;
  controls: string;
  open: boolean;
  rank: string | null;
  children: ComponentChildren;
  sub?: ComponentChildren;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      className="rl-fold-head"
      aria-expanded={open ? "true" : "false"}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className="rl-fold-rank">{rank ?? ""}</span>
      <span className="rl-fold-title">
        {children}
        {sub && <span className="rl-fold-sub">{sub}</span>}
      </span>
      <span className="rl-fold-chev" aria-hidden="true">
        <svg viewBox="0 0 12 12" focusable="false">
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </span>
    </button>
  );
}

function vendorWords(findings: readonly Finding[]): string {
  const phrase = vendorPhrase(findings);
  if (phrase === null) return "";
  const parts = phrase.parts.map((p) => (p.count > 1 ? `${String(p.count)} ${p.text}` : p.text));
  const all = phrase.others > 0 ? [...parts, `${String(phrase.others)} from other vendors`] : parts;
  return all.length <= 1 ? (all[0] ?? "") : `${all.slice(0, -1).join(", ")} and ${all.at(-1) ?? ""}`;
}

/** The row keys on screen, in order: a package's first visible row may be the list's Tab stop. */
function visibleKeys(layout: RadiusLayout, input: OpenInput): { key: string; pkg: string }[] {
  const rows = (list: readonly RadiusRow[], expandable: boolean) =>
    list.flatMap((row) => [
      { key: parentKey(row.package), pkg: row.package },
      ...(expandable && isRowOpen(row, input)
        ? pulledTree(row).map((n) => ({
            key: childKey(row.package, n.finding.package),
            pkg: n.finding.package,
          }))
        : []),
    ]);
  return [
    ...rows(layout.lead, true),
    ...(isFoldOpen(layout, FOLD_SINGLES, input) ? rows(layout.singles, true) : []),
    ...(isFoldOpen(layout, FOLD_SELF, input) ? rows(layout.selfOnly, false) : []),
    ...(isFoldOpen(layout, FOLD_OTHER, input)
      ? layout.receipt.map((r) => ({ key: receiptKey(r.finding.package), pkg: r.finding.package }))
      : []),
  ];
}

function motion(): ScrollBehavior {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}

/**
 * The jump a "listed under X" button makes: X's row (and the fold holding it) opens, the page
 * brings it into view and focus moves onto it, and the packages the button named are marked there
 * for a moment — a static mark under reduced motion, an outline in forced colours.
 */
function useJump(layout: RadiusLayout) {
  const { dispatch } = useReport();
  const [flash, setFlash] = useState<RowEnv["flash"]>(null);
  const pending = useRef<string | null>(null);

  useLayoutEffect(() => {
    const target = pending.current;
    if (target === null) return;
    pending.current = null;
    const row = Array.from(document.querySelectorAll<HTMLElement>(".rrow")).find(
      (node) => node.getAttribute("data-pkg") === target,
    );
    if (!row) return;
    row.focus({ preventScroll: true });
    if (typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "start", behavior: motion() });
  });

  useEffect(() => {
    if (flash === null) return undefined;
    const timer = window.setTimeout(() => {
      setFlash(null);
    }, FLASH_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [flash]);

  return {
    flash,
    jump: (under: string, packages: readonly string[]) => {
      if (layout.singles.some((r) => r.package === under))
        dispatch({ type: "disclose", key: FOLD_SINGLES, open: true });
      dispatch({ type: "disclose", key: rowKey(under), open: true });
      pending.current = under;
      setFlash({ under, packages });
    },
  };
}

/** Opens a tail fold from the line under the answer and moves focus to its head. */
function useFoldLink() {
  const { dispatch } = useReport();
  const pending = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = pending.current;
    if (id === null) return;
    pending.current = null;
    const head = document.getElementById(id);
    if (!head) return;
    head.focus({ preventScroll: true });
    if (typeof head.scrollIntoView === "function")
      head.scrollIntoView({ block: "start", behavior: motion() });
  });
  return (key: string, id: string) => {
    dispatch({ type: "disclose", key, open: true });
    pending.current = id;
  };
}

/** "Below the ranking: 5 flagged themselves · 7 reach flagged packages only through rows above" —
 *  each a link to its fold, which it opens. */
function TailLinks({ layout, go }: { layout: RadiusLayout; go: (key: string, id: string) => void }) {
  const links = [
    layout.selfOnly.length > 0 && (
      <button
        key="self"
        type="button"
        className="rl-jump"
        onClick={() => {
          go(FOLD_SELF, "rl-fold-self");
        }}
      >
        {layout.selfOnly.length} flagged themselves{"\u00a0↓"}
      </button>
    ),
    layout.throughOther.length > 0 && (
      <button
        key="other"
        type="button"
        className="rl-jump"
        onClick={() => {
          go(FOLD_OTHER, "rl-fold-other");
        }}
      >
        {layout.throughOther.length} that reach flagged packages only through rows above{"\u00a0↓"}
      </button>
    ),
  ].filter(Boolean);
  if (links.length === 0) return null;
  return <p className="rl-tails">Below the ranking: {joined(links)}</p>;
}

/** Flagged direct requirements `exposure[]` does not name: said once, at the end, so the tab's
 *  count never silently leaves them out. Each name opens that package's full detail, the one a
 *  Findings row opens, so the rail can count them as on this tab (PD-RAIL-1). */
function Unlisted({ findings }: { findings: readonly Finding[] }) {
  const { dispatch } = useReport();
  if (findings.length === 0) return null;
  const many = findings.length > 1;
  return (
    <p className="rl-foot">
      <b>{plural(findings.length, "flagged direct requirement has", "flagged direct requirements have")}</b>{" "}
      no row: lockrot's exposure list does not name {many ? "them" : "it"}.{" "}
      {many ? "Each opens its detail, as on Findings" : "It opens its detail, as on Findings"}:{" "}
      {joined(
        findings.map((f) => (
          <span key={f.package} className="fl-unit">
            <button
              type="button"
              className="rl-jump rl-pk"
              title={`Open ${f.package}`}
              onClick={() => {
                dispatch({ type: "select", pkg: f.package });
              }}
            >
              {f.package}
            </button>{" "}
            (<VerdictWord verdict={f.verdict} />)
          </span>
        )),
      )}
      .
    </p>
  );
}

/**
 * The Blast radius tab (PD-RADIUS-1..5, DESIGN.md §5): the answer sentence, then a ledger row per
 * direct requirement ranked by the flagged packages listed under it — squares on one scale, what it
 * pulls in, their years since release — with the one-each rows folded under one head, and at the
 * end the requirements that are flagged themselves and those that reach flagged packages only
 * through rows above. Ported from legacy `viewRadius` (report.js:595-625), fixed per M24/M25.
 */
export function RadiusView() {
  const { model, state, dispatch } = useReport();
  const narrow = useNarrow();
  const layout = radiusLayout(model, applyFilters(model, state, "radius"), population(model, "radius"));
  const input: OpenInput = { disclosure: state.disclosure, pkg: state.pkg, narrow };
  const { flash, jump } = useJump(layout);
  const go = useFoldLink();
  const axis = ageAxis(model.report.run.thresholds);
  const shown = [...layout.ranked, ...layout.selfOnly];

  if (shown.length === 0 && layout.throughOther.length === 0) {
    return (
      <div className="rl">
        <p className="empty">
          {layout.narrowed
            ? "No direct requirement is, or lists, a flagged package that matches the filter."
            : "No direct requirement drags a flagged package in."}
        </p>
        <ScopeNote layout={layout} />
        <Unlisted findings={layout.unlisted} />
      </div>
    );
  }

  const env: RowEnv = {
    axis,
    first: firstRows(
      visibleKeys(layout, input),
      (e) => e.pkg,
      (e) => e.key,
    ),
    jump,
    flash,
  };
  const answer = radiusAnswer(layout);
  const toggle = (key: string, open: boolean) => () => {
    dispatch({ type: "disclose", key, open: !open });
  };
  const singlesOpen = isFoldOpen(layout, FOLD_SINGLES, input);
  const selfOpen = isFoldOpen(layout, FOLD_SELF, input);
  const otherOpen = isFoldOpen(layout, FOLD_OTHER, input);
  const selfMix = verdictMix(layout.selfOnly.flatMap((r) => (r.self ? [r.self] : [])));
  // "12 more are…" after ranked rows; with none above, "12 direct requirements are…".
  const more = layout.ranked.length > 0;
  const selfN = layout.selfOnly.length;
  const selfLead = more
    ? plural(selfN, "more is", "more are")
    : plural(selfN, "direct requirement is", "direct requirements are");
  // A row here may list packages the filter keeps off: then it is not "nothing flagged".
  const selfNothing = layout.selfOnly.some((r) => r.unfiltered > 0)
    ? "nothing that matches the filter"
    : "nothing flagged";
  const onlyVerdict = selfMix.length === 1 ? selfMix[0]?.verdict : undefined;
  const ranked = (rows: readonly RadiusRow[], from: number) =>
    rows.map((row, i) => (
      <ParentRow
        key={row.package}
        row={row}
        rank={from + i}
        expandable
        open={isRowOpen(row, input)}
        env={env}
      />
    ));

  return (
    <div className={axis ? "rl" : "rl no-axis"} style={{ "--rl-sq": squaresWidth(shown) }}>
      {answer ? (
        <AnswerSentence answer={answer} id="rl-answer" narrowed={layout.narrowed} />
      ) : (
        <p className="rl-answer" id="rl-answer">
          None of your <b>{layout.exposureCount}</b> direct requirements lists a flagged package
          {layout.narrowed ? " that matches the filter" : ""}.
        </p>
      )}
      <ScopeNote layout={layout} />
      {more && <TailLinks layout={layout} go={go} />}
      {more && <Key hollow={shown.some((r) => r.elsewhere.length > 0)} />}
      {(more || (layout.selfOnly.length > 0 && selfOpen)) && <Head axis={axis} />}
      {layout.lead.length > 0 && (
        <ul
          className="rl-list"
          aria-label="Direct requirements, most flagged packages listed under them first"
        >
          {ranked(layout.lead, 1)}
        </ul>
      )}
      {layout.singles.length > 0 && (
        <div className="rl-fold is-singles">
          <FoldHead
            id="rl-fold-singles"
            controls="rl-singles"
            open={singlesOpen}
            rank={`${String(layout.lead.length + 1)}–${String(layout.lead.length + layout.singles.length)}`}
            onToggle={toggle(FOLD_SINGLES, singlesOpen)}
          >
            <b>{layout.singles.length} more</b> pull in one flagged package each:{" "}
            <MixWords mix={verdictMix(layout.singles.flatMap((r) => r.pulled))} />
          </FoldHead>
          <ul
            className="rl-list rl-fold-body"
            id="rl-singles"
            hidden={!singlesOpen}
            aria-label="Direct requirements that pull in one flagged package each"
          >
            {ranked(layout.singles, layout.lead.length + 1)}
          </ul>
        </div>
      )}
      {layout.selfOnly.length > 0 && (
        <div className="rl-fold is-tail">
          <FoldHead
            id="rl-fold-self"
            controls="rl-self"
            open={selfOpen}
            rank={null}
            onToggle={toggle(FOLD_SELF, selfOpen)}
            sub={vendorWords(layout.selfOnly.flatMap((r) => (r.self ? [r.self] : [])))}
          >
            <b>{selfLead}</b> flagged {selfN > 1 ? "themselves" : "itself"}
            {onlyVerdict ? (
              <>
                , {layout.selfOnly.length > 1 ? "all " : ""}
                <VerdictWord verdict={onlyVerdict} />
              </>
            ) : (
              <>
                {" "}
                (<MixWords mix={selfMix} />)
              </>
            )}
            , with {selfNothing} listed under {selfN > 1 ? "them" : "it"}.
          </FoldHead>
          <ul
            className="rl-list rl-fold-body"
            id="rl-self"
            hidden={!selfOpen}
            aria-label="Direct requirements flagged themselves"
          >
            {layout.selfOnly.map((row) => (
              <ParentRow key={row.package} row={row} rank={null} expandable={false} open={false} env={env} />
            ))}
          </ul>
        </div>
      )}
      {layout.throughOther.length > 0 && (
        <div className="rl-fold is-tail">
          <FoldHead
            id="rl-fold-other"
            controls="rl-other"
            open={otherOpen}
            rank={null}
            onToggle={toggle(FOLD_OTHER, otherOpen)}
            sub={
              <>
                {layout.throughOther.map((r) => r.package).join(", ")}. Each package they reach is listed
                under the row its recorded chain starts at.
              </>
            }
          >
            <b>
              {layout.throughOther.length}
              {more ? " more" : ""}
            </b>{" "}
            direct {layout.throughOther.length > 1 ? "requirements reach" : "requirement reaches"}{" "}
            {layout.narrowed ? "matching " : ""}flagged packages only through rows above.
          </FoldHead>
          <ul
            className="rl-receipt rl-fold-body"
            id="rl-other"
            hidden={!otherOpen}
            aria-label="Flagged packages reached only through rows above"
          >
            {layout.receipt.map((entry) => (
              <ReceiptRow key={entry.finding.package} entry={entry} env={env} />
            ))}
          </ul>
        </div>
      )}
      <Unlisted findings={layout.unlisted} />
    </div>
  );
}
