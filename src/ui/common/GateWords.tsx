import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Finding } from "../../model/types";
import {
  findingGateLine,
  gateFlag,
  gateHeadline,
  unflaggedFilters,
  type GateClause,
  type GateFlag,
  type GateHeadline,
  type RunGate,
} from "../../domain/gate";
import { applyFilters } from "../../domain/filters";
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
  return tail.length === 0 ? head : `${head} · ${tail.join(", ")}`;
}

/** The header's fact: "this run fails · --fail-on=high". Words only; the summary explains. Where the
 *  flags would push the page's buttons onto a second row, Header.tsx hides them from sight only. */
export function GateHeadlineText({ gate }: { gate: RunGate }) {
  const { model } = useReport();
  const words = gateHeadline(gate, model.report.run.mode);
  const { who, verb, flags, unapplied } = words;
  return (
    <span className="gate-fact" title={headlineTitle(words)}>
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
          <FlagList flags={flags} separator=", " />
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

/** The flagged failing packages, as the rail's "Fails this run" filter; from another tab, Findings
 *  with that filter added to the ones already on. */
function FlaggedToggle({ children }: { children: ComponentChildren }) {
  const { state, dispatch } = useReport();
  const here = state.view === "findings";
  const pressed = here && state.filters.gate.includes("fails");
  return (
    <button
      type="button"
      className="bl-toggle gate-toggle"
      aria-pressed={here ? pressed : undefined}
      title={here ? filterTitle("the findings that fail this run", pressed) : "List them on Findings"}
      onClick={() => {
        const gate = pressed ? [] : ["fails"];
        dispatch({ type: "focus", view: "findings", keepQuery: true, filters: { ...state.filters, gate } });
      }}
    >
      {children}
    </button>
  );
}

/** Goes to All packages, listing exactly the failing packages Findings does not: the search stays
 *  only when it hides none of them, so the list shows the count the words said. */
function UnflaggedLink({ count, children }: { count: number; children: ComponentChildren }) {
  const { model, state, dispatch } = useReport();
  const filters = unflaggedFilters(model);
  if (filters === null) return <>{children}</>;
  return (
    <button
      type="button"
      className="bl-toggle gate-go"
      onClick={() => {
        const kept = applyFilters(model, { ...state, filters }, "packages").length === count;
        dispatch({ type: "focus", view: "packages", keepQuery: kept, filters });
      }}
    >
      {children}
      <span className="vh">, on All packages</span>
      <span className="gate-go-mark" aria-hidden="true">
        →
      </span>
    </button>
  );
}

function fail(n: number): string {
  return `${n} fail${n === 1 ? "s" : ""} this run`;
}

/** After "N fail this run": flagged and not flagged apart, each a way to list them. */
function FailingSplit({ clause }: { clause: Extract<GateClause, { kind: "failing" }> }) {
  const { total, flagged, unflagged, unflaggedAs } = clause;
  if (unflagged === 0) return null;
  if (flagged === 0) {
    const unchecked = unflaggedAs === "unchecked";
    const words = total === 1 ? unflaggedAs : unchecked ? "all unchecked" : "none flagged";
    return (
      <>
        , <UnflaggedLink count={unflagged}>{words}</UnflaggedLink>
      </>
    );
  }
  return (
    <>
      :{" "}
      <FlaggedToggle>
        <b>{flagged}</b> flagged
      </FlaggedToggle>
      ,{" "}
      <UnflaggedLink count={unflagged}>
        <b>{unflagged}</b> {unflaggedAs}
      </UnflaggedLink>
    </>
  );
}

/** The summary's answer, in the Against sentence or on a line of its own: its subject opens level 1
 *  (`lead` wraps it), the counts after it list what they count. */
export function GateClauseText({
  clause,
  opening,
  lead,
}: {
  clause: GateClause;
  opening: boolean;
  lead: (subject: ComponentChildren) => ComponentChildren;
}) {
  switch (clause.kind) {
    case "failing":
      return (
        <>
          {lead(fail(clause.total))}
          <FailingSplit clause={clause} />
        </>
      );
    case "tripped":
      return (
        <>
          {lead(`${opening ? "This" : "the"} run fails`)} by <FlagList flags={clause.flags} />
        </>
      );
    case "none-fail":
      return (
        <>
          {lead(`${opening ? "None" : "none"} fails this run`)}
          {opening && (
            <>
              ; <b>{clause.meets}</b>{" "}
              {clause.meets === 1 ? "meets the fail-on but is" : "meet the fail-on but are"} exempt
            </>
          )}
        </>
      );
    case "unapplied":
      return (
        <>
          {lead(
            <>
              {clause.meets} {clause.meets === 1 ? "meets" : "meet"}{" "}
              <Flag text={gateFlag("fail_on", clause.failOn).text} />
            </>,
          )}
          , not applied
        </>
      );
  }
}

/** The answer's subject as the button that opens level 1, and the panel it opens under the sentence. */
export function useGateWhy(gate: RunGate | null): {
  lead: (subject: ComponentChildren) => ComponentChildren;
  panel: ComponentChildren;
} | null {
  const id = `${useId()}-gate-why`;
  const { open, toggle, printed } = useDisclosure(WHY_KEY);
  if (gate === null) return null;
  const lead = (subject: ComponentChildren): ComponentChildren =>
    printed ? (
      <b className="gate-total">{subject}</b>
    ) : (
      <DisclosureButton
        label={subject}
        open={open}
        controls={id}
        onToggle={toggle}
        lead
        className="gate-total"
      />
    );
  return {
    lead,
    panel: (
      <DisclosurePanel id={id} open={open} className="gate-why">
        <GateDetails gate={gate} />
      </DisclosurePanel>
    ),
  };
}

/** One of a row's copies of its gate words (gateFit.ts shows the one that fits); the row's
 *  description says them once, so each copy is hidden from a screen reader. */
export function RowGateMark({ words, fails, at }: { words: string; fails: boolean; at: string }) {
  return (
    <span className={`gate-mark ${fails ? "is-fails" : "is-exempt"} gate-at-${at}`} aria-hidden="true">
      {words}
    </span>
  );
}

/** What a screen reader hears after a row's name and verdict. */
export function rowGateSpoken(words: string, fails: boolean): string {
  return fails ? "fails this run" : `${words}, does not fail`;
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
