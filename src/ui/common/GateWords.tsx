import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Finding } from "../../model/types";
import {
  findingGateLine,
  gateClause,
  gateHeadline,
  unflaggedFilters,
  type GateClause,
  type GateFlag,
  type GateHeadline,
  type RowGate,
  type RunGate,
} from "../../domain/gate";
import { applyFilters } from "../../domain/filters";
import { EMPTY_FILTERS, type Filters } from "../../state/types";
import { filterTitle } from "./common";
import { useReport } from "../context";
import { Flag } from "./GateFlag";
import { DisclosureButton, DisclosurePanel, useDisclosure } from "./Disclosure";
import { GateDetails } from "./GateDetails";
import "../views/baseline.css";
import "./gate.css";

const WHY_KEY = "gate-why";

function Sep() {
  return <span className="gate-sep"> · </span>;
}

/** "--strict-network and licence_policy": a cause this page has no words for, as written. */
function FlagList({ flags, separator }: { flags: readonly GateFlag[]; separator?: string }) {
  return (
    <>
      {flags.map((flag, i) => (
        <span key={flag.text}>
          {i === 0 ? "" : (separator ?? (i === flags.length - 1 ? " and " : ", "))}
          {flag.known ? <Flag text={flag.text} /> : <code className="mono gate-flag">{flag.text}</code>}
        </span>
      ))}
    </>
  );
}

/** The header's words as one line of text, for the fact's tooltip when its flags are hidden. */
function headlineTitle({ who, verb, flags, unapplied }: GateHeadline): string {
  const head = verb === null ? who : `${who} ${verb}`;
  const tail = [
    ...flags.map((flag) => flag.text),
    ...(unapplied === null ? [] : [`${unapplied} not applied`]),
  ];
  return tail.length === 0 ? head : `${head} · ${tail.join(" · ")}`;
}

/** The header's fact: "this run fails · --fail-on=high". Words only; the summary explains. Header.tsx
 *  hides the flags from sight where they cost a line; `data-said`: the summary names them anyway. */
export function GateHeadlineText({ gate }: { gate: RunGate }) {
  const { model } = useReport();
  const words = gateHeadline(gate, model.report.run.mode);
  const { who, verb, flags, unapplied } = words;
  const said = gateClause(gate)?.kind === "tripped" && gate.causes.every((cause) => cause !== "fail_on");
  return (
    <span className="gate-fact" title={headlineTitle(words)} data-said={said ? "" : undefined}>
      {who}
      {verb !== null && (
        <>
          {" "}
          <b className={verb === "fails" ? "gate-word is-fails" : "gate-word"}>{verb}</b>
        </>
      )}
      {(flags.length > 0 || unapplied !== null) && (
        <span className="gate-fact-more">
          <Sep />
          <FlagList flags={flags} separator=" · " />
          {unapplied !== null && (
            <span className="gate-quiet">
              <Flag text={unapplied} /> not applied
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** The flagged failing packages, as the rail's "Fails this run" filter added to the ones on; from
 *  another tab, whose filters say nothing of Findings, Findings with that filter alone, the search
 *  kept only when it hides none of them. */
function FlaggedToggle({ count, children }: { count: number; children: ComponentChildren }) {
  const { model, state, dispatch } = useReport();
  const here = state.view === "findings";
  const pressed = here && state.filters.gate.includes("fails");
  const press = (event: { currentTarget: HTMLButtonElement }) => {
    event.currentTarget.focus();
    if (here) {
      const gate = pressed ? [] : ["fails"];
      dispatch({ type: "focus", view: "findings", keepQuery: true, filters: { ...state.filters, gate } });
      return;
    }
    const filters = { ...EMPTY_FILTERS, gate: ["fails"] };
    const kept = applyFilters(model, { ...state, filters }, "findings").length === count;
    dispatch({ type: "focus", view: "findings", keepQuery: kept, filters });
  };
  return (
    <button
      type="button"
      className="bl-toggle gate-toggle"
      aria-pressed={here ? pressed : undefined}
      title={here ? filterTitle("the findings that fail this run", pressed) : "List them on Findings"}
      onClick={press}
    >
      {children}
      {!here && <span className="vh">, on Findings</span>}
    </button>
  );
}

/** Goes to All packages with `filters`, the search kept only when it hides none of the `count`, so
 *  the list shows the count the words said. `mark`: the arrow that says it leaves this tab. */
function PackagesLink({
  filters,
  count,
  mark,
  children,
}: {
  filters: Filters;
  count: number;
  mark: boolean;
  children: ComponentChildren;
}) {
  const { model, state, dispatch } = useReport();
  return (
    <button
      type="button"
      className="bl-toggle gate-go"
      title="List them on All packages"
      onClick={(event) => {
        event.currentTarget.focus();
        const kept = applyFilters(model, { ...state, filters }, "packages").length === count;
        dispatch({ type: "focus", view: "packages", keepQuery: kept, filters });
      }}
    >
      {children}
      <span className="vh">, on All packages</span>
      {mark && (
        <span className="gate-go-mark" aria-hidden="true">
          →
        </span>
      )}
    </button>
  );
}

/** Exactly the failing packages Findings does not list; plain words when no filter lists them alone. */
function UnflaggedLink({ count, children }: { count: number; children: ComponentChildren }) {
  const { model } = useReport();
  const filters = unflaggedFilters(model);
  if (filters === null) return <>{children}</>;
  return (
    <PackagesLink filters={filters} count={count} mark>
      {children}
    </PackagesLink>
  );
}

const FAILING: Filters = { ...EMPTY_FILTERS, gate: ["fails"] };

function fail(n: number): string {
  return n === 1 ? "fails this run" : "fail this run";
}

/** "12 fail this run": the count lists them, on Findings when it lists them all, else on All
 *  packages, where every failing package is. */
function FailingTotal({ clause }: { clause: Extract<GateClause, { kind: "failing" }> }) {
  const { total, unflagged } = clause;
  const words = (
    <>
      <b>{total}</b> {fail(total)}
    </>
  );
  if (unflagged === 0) return <FlaggedToggle count={total}>{words}</FlaggedToggle>;
  return (
    <PackagesLink filters={FAILING} count={total} mark={false}>
      {words}
    </PackagesLink>
  );
}

/** The header's flags again, where the header hid them for room (Header.tsx); gate.css shows them. */
function Echo({ children }: { children: ComponentChildren }) {
  return <span className="gate-echo">{children}</span>;
}

/** The failing clause's words after the total: flagged and not flagged apart, each a way to list
 *  them; all of one kind in words only, since the total already lists them. */
function FailingSplit({ clause }: { clause: Extract<GateClause, { kind: "failing" }> }) {
  const { total, flagged, unflaggedAs } = clause;
  if (flagged === 0) {
    const unchecked = unflaggedAs === "unchecked";
    return <>, {total === 1 ? unflaggedAs : unchecked ? "all unchecked" : "none flagged"}</>;
  }
  return (
    <>
      :{" "}
      <span className="nowrap">
        <FlaggedToggle count={flagged}>
          <b>{flagged}</b> flagged
        </FlaggedToggle>
        ,
      </span>{" "}
    </>
  );
}

/** "173 fail this run by --fail-on=unchecked: 2 flagged, 171 unchecked →." Its last control keeps
 *  `close` on its line: a line may break after a button, which would strand the full stop. */
function FailingText({
  clause,
  close,
}: {
  clause: Extract<GateClause, { kind: "failing" }>;
  close: ComponentChildren;
}) {
  const split = clause.unflagged > 0;
  const by = clause.echo !== null && (
    <Echo>
      {" "}
      by <FlagList flags={[clause.echo]} />
    </Echo>
  );
  const also = clause.also.length > 0 && (
    <Echo>
      {split ? "; " : ", and "}
      <FlagList flags={clause.also} /> {clause.also.length === 1 ? "fails" : "fail"} the run too
    </Echo>
  );
  if (!split) {
    return (
      <span className="nowrap">
        <FailingTotal clause={clause} />
        {by}
        {also}
        {close}
      </span>
    );
  }
  const last =
    clause.flagged === 0 ? null : (
      <UnflaggedLink count={clause.unflagged}>
        <b>{clause.unflagged}</b> {clause.unflaggedAs}
      </UnflaggedLink>
    );
  return (
    <>
      <FailingTotal clause={clause} />
      {by}
      <FailingSplit clause={clause} />
      <span className="nowrap">
        {last}
        {also}
        {close}
      </span>
    </>
  );
}

/** The summary's answer, in the Against sentence or on a line of its own, then `close`, its full
 *  stop: each count lists what it counts; what fails the run opens from its own control after the
 *  sentence (`useGateWhy`). */
export function GateClauseText({
  clause,
  opening,
  close,
}: {
  clause: GateClause;
  opening: boolean;
  close: ComponentChildren;
}) {
  switch (clause.kind) {
    case "failing":
      return <FailingText clause={clause} close={close} />;
    case "tripped":
      return (
        <>
          <b className="gate-total">{opening ? "This" : "the"} run fails</b> by{" "}
          <FlagList flags={clause.flags} />
          {clause.unapplied && "; it applies no fail-on"}
          {close}
        </>
      );
    case "none-fail":
      return (
        <>
          <b className="gate-total">{opening ? "None" : "none"} fails this run</b>
          {clause.echo !== null && (
            <Echo>
              {" "}
              by <FlagList flags={[clause.echo]} />
            </Echo>
          )}
          {opening && clause.exempt > 0 && (
            <>
              ; <b>{clause.exempt}</b>{" "}
              {clause.exempt === 1 ? "meets the fail-on but is" : "meet the fail-on but are"} exempt
            </>
          )}
          {close}
        </>
      );
    case "unapplied":
      return (
        <>
          <b className="gate-total">{opening ? "This" : "this"} run passes</b>: it applies no fail-on
          {clause.meets > 0 && (
            <>
              , though <b>{clause.meets}</b> {clause.meets === 1 ? "package meets" : "packages meet"} it
            </>
          )}
          {close}
        </>
      );
  }
}

/** The opener's accessible name: what it explains, which its visible "why" is the start of. */
function whyName(clause: GateClause): string {
  switch (clause.kind) {
    case "failing":
    case "tripped":
      return "Why this run fails";
    case "none-fail":
      return "Why none fails this run";
    case "unapplied":
      return "Why this run passes";
  }
}

/** Level 1's own small control after the answer, apart from its counts, and the panel it opens
 *  under the sentence; on paper the panel alone, open. */
export function useGateWhy(
  gate: RunGate | null,
  clause: GateClause | null,
): { opener: ComponentChildren; panel: ComponentChildren } | null {
  const id = `${useId()}-gate-why`;
  const { open, toggle, printed } = useDisclosure(WHY_KEY);
  if (gate === null || clause === null) return null;
  return {
    opener: printed ? null : (
      <>
        {" "}
        <DisclosureButton
          label={<span className="gate-why-label">why</span>}
          name={whyName(clause)}
          open={open}
          controls={id}
          onToggle={toggle}
          className="gate-why-btn"
        />
      </>
    ),
    panel: (
      <DisclosurePanel id={id} open={open} className="gate-why">
        <GateDetails gate={gate} />
      </DisclosurePanel>
    ),
  };
}

/** One of a row's copies of its gate words (gateFit.ts shows the one that fits, and drops `why`
 *  where it would cost the row a line); the row's description says them once, so each copy is
 *  hidden from a screen reader. */
export function RowGateMark({ gate, at }: { gate: RowGate; at: string }) {
  return (
    <span className={`gate-mark ${gate.fails ? "is-fails" : "is-exempt"} gate-at-${at}`} aria-hidden="true">
      {gate.words}
      {gate.why !== null && <span className="gate-mark-why"> · {gate.why}</span>}
    </span>
  );
}

/** What a screen reader hears after a row's name and verdict. */
export function rowGateSpoken(gate: RowGate): string {
  if (!gate.fails) return `${gate.words}, does not fail`;
  return gate.why === "unchecked" ? "fails this run, unchecked: a check did not run" : "fails this run";
}

/** The detail's line under its pills: "fails this run · meets --fail-on=unchecked". */
export function DetailGateLine({ finding }: { finding: Finding }) {
  const { model } = useReport();
  const line = findingGateLine(model, finding);
  if (line === null) return null;
  return (
    <p className="detail-gate">
      {line.fails ? (
        <b className="gate-word is-fails">fails this run</b>
      ) : (
        <span className="gate-word">does not fail</span>
      )}
      {line.meets !== null && (
        <>
          <Sep />
          meets <Flag text={line.meets} />
        </>
      )}
      {line.apart !== null && <>, {line.apart}</>}
    </p>
  );
}
