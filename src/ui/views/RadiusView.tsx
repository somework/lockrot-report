import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Finding } from "../../model/types";
import { applyFilters, population } from "../../domain/filters";
import { freeTextTermsVerbatim, parseQuery } from "../../domain/query";
import { searchHit } from "../../domain/searchHits";
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
import { PkgMention } from "../common/PkgMention";
import { firstRows } from "../rowCursor";
import { useNarrow } from "../useWide";
import { usePrinted } from "../print/printContext";
import { AgeAxis as AgeAxisHead } from "./AgeScale";
import { joined, MixWords, squaresWidth, VerdictWord } from "./RadiusMarks";
import { childKey, parentKey, ParentRow, receiptKey, ReceiptRow, type RowEnv } from "./RadiusRows";
import "./views.css";
import "./ledger-rows.css";
import "./radius.css";

/** How long the packages a jump lands on stay marked. */
const FLASH_MS = 1800;

function Pk({ name }: { name: string }) {
  return <PkgMention name={name} className="rl-pk" />;
}

/**
 * "the 29 direct requirements lockrot's exposure list names": the one denominator the tab counts
 * against. `exposure[]` is not every direct requirement the project has — only those with flagged
 * packages under them; the footnote names the flagged ones with none — so no sentence here says
 * "your 29 direct requirements" (PD-RADIUS-1).
 */
function ExposureList({ n, lead }: { n: number; lead: ComponentChildren }) {
  return n === 1 ? (
    <>the one direct requirement lockrot's exposure list names</>
  ) : (
    <>
      {lead} the <b>{n}</b> direct requirements lockrot's exposure list names
    </>
  );
}

/**
 * The tab's answer, first (PD-RADIUS-1): the fewest rows that hold half of what is listed, by name
 * and count, against every flagged package listed and every direct requirement `exposure` names —
 * "wallabag/rulerz (14) and phpunit/phpunit (13) pull in 27 of the 49 flagged packages that sit
 * under 17 of the 29 direct requirements lockrot's exposure list names." Counts only. Under a
 * filter every count is of the packages that match it, and the sentence says "matching"
 * (PD-RADIUS-6).
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
            <Pk name={lead.package} />, <ExposureList n={1} lead="" />, pulls in <b>{lead.count}</b> {flagged}{" "}
            {lead.count === 1 ? "package" : "packages"}.
          </>
        ) : (
          <>
            <ExposureList n={exposureCount} lead="Of" />, only <Pk name={lead.package} /> has {flagged}{" "}
            packages under it: <b>{lead.count}</b>.
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
      that sit under{" "}
      <ExposureList
        n={exposureCount}
        lead={
          <>
            <b>{rows}</b> of
          </>
        }
      />
      .
    </p>
  );
}

/**
 * Where the flagged direct requirements are when none lists anything: "12 on lockrot's exposure
 * list, below, and 8 with nothing flagged counted under them, at the end" — the tail fold and the footnote,
 * in that order.
 */
function whereWords(self: number, unlisted: number): ComponentChildren {
  if (self > 0 && unlisted > 0) {
    return (
      <>
        : <b>{self}</b> on lockrot's exposure list, below, and <b>{unlisted}</b> with nothing flagged counted
        under {unlisted === 1 ? "it" : "them"}, at the end.
      </>
    );
  }
  if (self > 0)
    return self > 1 ? (
      <>; all are on lockrot's exposure list, below.</>
    ) : (
      <>; it is on lockrot's exposure list, below.</>
    );
  return unlisted > 1 ? (
    <>; none has anything flagged counted under it, so they are at the end.</>
  ) : (
    <>; it has nothing flagged counted under it, so it is at the end.</>
  );
}

/**
 * The answer when no row lists anything (a filter, or a lock whose flagged packages are all direct
 * requirements): what there is instead, never only what there is not — "The filter matches 20
 * flagged direct requirements themselves, and nothing listed under any of them: 12 on lockrot's
 * exposure list, below, and 8 with nothing flagged counted under them, at the end."
 */
function NoRankAnswer({ layout, id }: { layout: RadiusLayout; id: string }) {
  const self = layout.selfOnly.length;
  const unlisted = layout.unlisted.length;
  const all = self + unlisted;
  if (all === 0) {
    return (
      <p className="rl-answer" id={id}>
        No flagged package{layout.narrowed ? " that matches the filter" : ""} sits under{" "}
        <ExposureList n={layout.exposureCount} lead="any of" />.
      </p>
    );
  }
  const many = all > 1;
  if (layout.narrowed) {
    return (
      <p className="rl-answer" id={id}>
        The filter matches <b>{all}</b> flagged direct{" "}
        {many ? "requirements themselves" : "requirement itself"}, and nothing listed under{" "}
        {many ? "any of them" : "it"}
        {whereWords(self, unlisted)}
      </p>
    );
  }
  return (
    <p className="rl-answer" id={id}>
      No flagged package sits under <ExposureList n={layout.exposureCount} lead="any of" />.{" "}
      {many ? (
        <>
          The <b>{all}</b> flagged are direct requirements themselves
        </>
      ) : (
        <>The one flagged package is a direct requirement itself</>
      )}
      {whereWords(self, unlisted)}
    </p>
  );
}

/** Under a filter, what the counts cover and what they are without it: "Only flagged packages that
 *  match the filter are counted. Without it, 49 sit under 17 of the 29 direct requirements
 *  lockrot's exposure list names." */
function ScopeNote({ layout }: { layout: RadiusLayout }) {
  if (!layout.narrowed) return null;
  return (
    <p className="rl-scope">
      Only flagged packages that match the filter are counted.
      {layout.unfilteredTotal > 0 && (
        <>
          {" "}
          Without it, <b>{layout.unfilteredTotal}</b> sit under{" "}
          <ExposureList
            n={layout.exposureCount}
            lead={
              <>
                <b>{layout.unfilteredRows}</b> of
              </>
            }
          />
          .
        </>
      )}
    </p>
  );
}

/**
 * The key under the answer: every colour and mark a row draws. The squares are the row's one loud
 * colour, by priority as the summary band's waffle; a verdict keeps only a small dot of its own
 * colour; an age tick is ink until it passes a guide, then takes that guide's colour; a dash in the
 * age column means no age to draw. Short items, so a phone keeps it to a few lines; "one square size
 * on every row" is in each squares cell's title.
 */
function Key({
  squares,
  hollow,
  axis,
}: {
  squares: boolean;
  hollow: boolean;
  axis: ReturnType<typeof ageAxis>;
}) {
  return (
    <p className="rl-key" aria-hidden="true">
      {squares && (
        <span className="rl-key-item">
          <i className="rl-u tone-crit" />
          <i className="rl-u tone-high" />
          <i className="rl-u tone-med" />
          <i className="rl-u tone-low" />a flagged package under the row, by priority
        </span>
      )}
      {hollow && (
        <span className="rl-key-item">
          <i className="rl-u is-else" />
          +N reached too, listed under another row
        </span>
      )}
      <span className="rl-key-item">
        <i className="rl-key-dot tone-crit" />
        <i className="rl-key-dot tone-med" />
        verdict, its colour on Findings
      </span>
      {axis && (
        <>
          <span className="rl-key-item">
            <i className="rl-key-tick is-under" />
            <i className="rl-key-tick tone-med" />
            <i className="rl-key-tick tone-crit" />
            years; past {axis.warn}y or {axis.high}y, that guide's colour
          </span>
          <span className="rl-key-item">
            <i className="rl-key-tick is-context" />
            faint: abandoned or pinned, age only context
          </span>
        </>
      )}
      <span className="rl-key-item">
        <span className="rl-key-dash">–</span>
        in years: not flagged for age
      </span>
    </p>
  );
}

/**
 * The column head. Its age caption says whose years the column shows, since the tab draws two kinds:
 * a ranked row's are those of the packages listed under it ("Their years since release"); a row in
 * the "flagged themselves" tail lists none, so its are the requirement's own, and that tail carries
 * its own head saying so.
 */
function Head({
  axis,
  own = false,
  hidden = false,
}: {
  axis: ReturnType<typeof ageAxis>;
  own?: boolean;
  hidden?: boolean;
}) {
  return (
    <div className={own ? "rl-head is-own" : "rl-head"} hidden={hidden}>
      <span className="rl-h rl-h-rank" aria-hidden="true">
        {own ? "" : "#"}
      </span>
      <span className="rl-h rl-h-pkg" aria-hidden="true">
        {own ? "Flagged itself" : "Direct requirement"}
        <span className="rl-h-narrow">
          {own ? " · listed under it" : " · flagged under it · what it pulls in"}
        </span>
      </span>
      <span className="rl-h rl-h-sq" aria-hidden="true">
        Flagged underneath
      </span>
      <span className="rl-h rl-h-say" aria-hidden="true">
        {own ? "Listed under it" : "What it pulls in"}
      </span>
      {axis ? (
        <AgeAxisHead
          axis={axis}
          caption={own ? "Its own years since release" : "Their years since release"}
          whose={own ? "each requirement's own" : "the flagged packages listed under each requirement"}
        />
      ) : (
        <span className="fhead-age" />
      )}
    </div>
  );
}

/**
 * A fold's head: a button over its rows, its sentence the fold's whole summary. `fixed` — a tail that
 * is the whole list, nothing ranked above it — makes it a plain heading over rows always shown, never
 * a fold that could hide what the answer sentence just counted.
 */
function FoldHead({
  id,
  controls,
  open,
  rank,
  children,
  sub,
  onToggle,
  fixed = false,
}: {
  id: string;
  controls: string;
  open: boolean;
  rank: string | null;
  children: ComponentChildren;
  sub?: ComponentChildren;
  onToggle: () => void;
  fixed?: boolean;
}) {
  const body = (
    <>
      <span className="rl-fold-rank">{rank ?? ""}</span>
      <span className="rl-fold-title">
        {children}
        {sub && <span className="rl-fold-sub">{sub}</span>}
      </span>
    </>
  );
  if (fixed) {
    return (
      <div id={id} className="rl-fold-head is-fixed">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      id={id}
      className="rl-fold-head"
      aria-expanded={open ? "true" : "false"}
      aria-controls={controls}
      onClick={onToggle}
    >
      {body}
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
        {layout.selfOnly.length} flagged {layout.selfOnly.length === 1 ? "itself" : "themselves"}
        {"\u00a0↓"}
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

/** Flagged direct requirements with nothing flagged counted under them (lockrot does not count a
 *  package shared by more than eight requirements), which `exposure[]` therefore does not name:
 *  said once, at the end, so the tab's count never silently leaves them out. Each name opens that package's full detail, the one a
 *  Findings row opens, so the rail can count them as on this tab (PD-RAIL-1). */
function Unlisted({ findings }: { findings: readonly Finding[] }) {
  const { dispatch } = useReport();
  const printed = usePrinted();
  if (findings.length === 0) return null;
  const many = findings.length > 1;
  // Paper has no detail to open: there the names follow the sentence alone.
  const opens = printed
    ? many
      ? "They are"
      : "It is"
    : many
      ? "Each opens its detail, as on Findings"
      : "It opens its detail, as on Findings";
  return (
    <p className="rl-foot">
      <b>{plural(findings.length, "flagged direct requirement has", "flagged direct requirements have")}</b>{" "}
      no row: nothing flagged is counted under {many ? "them" : "it"}, so lockrot's exposure list has no entry
      for {many ? "them" : "it"}. {opens}:{" "}
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
 * The "flagged themselves" tail's head: "5 more are flagged themselves, all left-behind, with nothing
 * flagged listed under them." Under a filter that keeps what they list off the tab, what puts them
 * here is that they match it themselves — and where: "1 more matches “hoa” only in its own evidence
 * (pinned); nothing listed under it matches the filter" when the search found the words only in what
 * lockrot wrote about it (`domain/searchHits.ts`), not in its name, version or verdict.
 */
function SelfTitle({
  lead,
  count,
  filtered,
  mix,
  only,
  byEvidence,
  query,
}: {
  lead: string;
  count: number;
  filtered: boolean;
  mix: ReturnType<typeof verdictMix>;
  only: string | undefined;
  /** How many of the tail's requirements the search found only in their evidence. */
  byEvidence: number;
  /** The search's free text as the reader typed it. */
  query: string;
}) {
  const many = count > 1;
  const verdicts = only ? (
    <>
      {many ? "all " : ""}
      <VerdictWord verdict={only} />
    </>
  ) : (
    <MixWords mix={mix} />
  );
  const them = many ? "them" : "it";
  if (filtered && byEvidence === count) {
    return (
      <>
        <b>{lead}</b> {many ? "match" : "matches"} “{query}” only in {many ? "their" : "its"} own evidence (
        {verdicts}); nothing listed under {them} matches the filter.
      </>
    );
  }
  if (filtered) {
    return (
      <>
        <b>{lead}</b> {many ? "match the filter themselves" : "matches the filter itself"} ({verdicts})
        {byEvidence > 0 && (
          <>
            , {byEvidence === 1 ? "one" : byEvidence} only in {byEvidence === 1 ? "its" : "their"} own
            evidence
          </>
        )}
        ; nothing listed under {them} does.
      </>
    );
  }
  return (
    <>
      <b>{lead}</b> {many ? "are flagged themselves" : "is flagged itself"}
      {only ? <>, {verdicts}</> : <> ({verdicts})</>}, with nothing flagged listed under {them}.
    </>
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
  const printed = usePrinted();
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
  // A row here may list packages the filter keeps off: then the tail is of requirements that match
  // the filter themselves, with nothing listed under them that does.
  const selfFiltered = layout.selfOnly.some((r) => r.unfiltered > 0);
  const selfLead = more
    ? `${String(selfN)} more`
    : plural(selfN, "direct requirement", "direct requirements");
  const onlyVerdict = selfMix.length === 1 ? selfMix[0]?.verdict : undefined;
  // Where the search found each tail requirement: "only in its own evidence" when no part a row
  // shows holds the words (PD-SEARCH-1).
  const terms = parseQuery(state.q);
  const selfByEvidence = layout.selfOnly.filter(
    (r) => r.self !== null && searchHit(r.self, terms)?.field === "evidence",
  ).length;
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

  const key = (more || selfOpen) && (
    <Key squares={more} hollow={shown.some((r) => r.elsewhere.length > 0)} axis={axis} />
  );
  const head = more && <Head axis={axis} />;
  const list = layout.lead.length > 0 && (
    <ul className="rl-list" aria-label="Direct requirements, most flagged packages listed under them first">
      {ranked(layout.lead, 1)}
    </ul>
  );
  const singlesFold = layout.singles.length > 0 && (
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
  );

  return (
    <div className={axis ? "rl" : "rl no-axis"} style={{ "--rl-sq": squaresWidth(shown) }}>
      {answer ? (
        <AnswerSentence answer={answer} id="rl-answer" narrowed={layout.narrowed} />
      ) : (
        <NoRankAnswer layout={layout} id="rl-answer" />
      )}
      <ScopeNote layout={layout} />
      {more && <TailLinks layout={layout} go={go} />}
      {printed && list ? (
        // PD-PRINT-5: on paper the key and the column head are a table's head, which the print
        // engine repeats over every page the ranked rows run onto (print.css `.rl-ptable`).
        <>
          <div className="rl-ptable">
            <div className="rl-ptop">
              {key}
              {head}
            </div>
            {list}
          </div>
          {singlesFold}
        </>
      ) : (
        <>
          {key}
          {/* The ranked rows and their one-each fold in a box of their own, so the sticky column head
              — "Their years since release" — stops where they do and never sits over the "flagged
              themselves" tail's own head, "Its own years since release". */}
          {more ? (
            <div className="rl-ranked">
              {head}
              {list}
              {singlesFold}
            </div>
          ) : null}
        </>
      )}
      {layout.selfOnly.length > 0 && (
        <div className={more ? "rl-fold is-tail" : "rl-fold is-tail is-whole"}>
          <FoldHead
            id="rl-fold-self"
            controls="rl-self"
            open={selfOpen}
            rank={null}
            fixed={!more}
            onToggle={toggle(FOLD_SELF, selfOpen)}
            sub={vendorWords(layout.selfOnly.flatMap((r) => (r.self ? [r.self] : [])))}
          >
            <SelfTitle
              lead={selfLead}
              count={selfN}
              filtered={selfFiltered}
              mix={selfMix}
              only={onlyVerdict}
              byEvidence={selfByEvidence}
              query={freeTextTermsVerbatim(state.q).join(" ")}
            />
          </FoldHead>
          {axis && <Head axis={axis} own hidden={!selfOpen} />}
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
