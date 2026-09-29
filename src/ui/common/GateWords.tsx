import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Finding } from "../../model/types";
import { plural } from "../../domain/format";
import { failOnThreshold } from "../../domain/run";
import {
  baselineExemption,
  exemptWords,
  findingGateMark,
  gateFlag,
  gateHeadline,
  networkNotes,
  unflaggedFilters,
  type FindingGateMark,
  type GateClause,
  type RunGate,
} from "../../domain/gate";
import type { GateSpot } from "../views/gateFit";
import { filterTitle } from "./common";
import { useReport } from "../context";
import { DisclosureButton, DisclosurePanel, useDisclosure } from "./Disclosure";
import "../views/baseline.css";
import "./gate.css";

const WHY_KEY = "gate-why";

function Flag({ text }: { text: string }) {
  return <span className="mono gate-flag">{text}</span>;
}

/** The header's fact: "this run fails · --fail-on=high". Words only; the summary explains. */
export function GateHeadlineText({ gate }: { gate: RunGate }) {
  const { model } = useReport();
  const words = gateHeadline(gate, model.report.run.mode);
  const lead =
    gate.outcome === "fails" ? (
      <>
        this run <b className="gate-word is-fails">fails</b>
      </>
    ) : gate.outcome === "passes" ? (
      <>
        this run <b className="gate-word">passes</b>
      </>
    ) : (
      words.lead
    );
  const flags = words.flags.flatMap((flag, i) => [
    ...(i === 0 ? [] : [" "]),
    <Flag key={flag.text} text={flag.text} />,
  ]);
  return (
    <span className="gate-fact">
      {lead}
      {flags.length > 0 && (
        <>
          <span className="gate-sep"> · </span>
          {flags}
        </>
      )}
      {words.unapplied !== null && (
        <>
          <span className="gate-sep"> · </span>
          <Flag text={words.unapplied} /> <span className="gate-quiet">not applied</span>
        </>
      )}
    </span>
  );
}

/**
 * The flagged failing packages, as a filter over Findings: a toggle there, the same `gate` key as
 * the rail's "Fails this run"; from another tab, Findings with that filter added.
 */
function FindingsToggle({ children }: { children: ComponentChildren }) {
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
        if (here) {
          dispatch({ type: "toggle", group: "gate", key: "fails", reveal: !pressed });
          return;
        }
        const gate = state.filters.gate.includes("fails")
          ? state.filters.gate
          : [...state.filters.gate, "fails"];
        dispatch({ type: "focus", view: "findings", keepQuery: true, filters: { ...state.filters, gate } });
      }}
    >
      {children}
    </button>
  );
}

/** Goes to All packages, listing exactly the failing packages Findings does not. */
function UnflaggedLink({ children }: { children: ComponentChildren }) {
  const { model, dispatch } = useReport();
  const filters = unflaggedFilters(model);
  if (filters === null) return <>{children}</>;
  return (
    <button
      type="button"
      className="bl-toggle gate-go"
      onClick={() => {
        dispatch({ type: "focus", view: "packages", keepQuery: true, filters });
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

/** The summary's answer: every failing package first, then flagged and not flagged apart. `lead`
 *  wraps the answer's subject when it opens its own line, where it is the level-1 button. */
export function GateClauseText({
  clause,
  opening,
  lead,
}: {
  clause: GateClause;
  opening: boolean;
  lead?: (subject: ComponentChildren) => ComponentChildren;
}) {
  const { model } = useReport();
  if (lead !== undefined) return <LeadClause clause={clause} lead={lead} />;
  switch (clause.kind) {
    case "failing": {
      const { total, flagged, unflagged } = clause;
      if (unflagged === 0) {
        return (
          <FindingsToggle>
            <b>{total}</b> fail{total === 1 ? "s" : ""} this run
          </FindingsToggle>
        );
      }
      const head = (
        <b className="gate-total">
          {total} fail{total === 1 ? "s" : ""} this run
        </b>
      );
      if (flagged === 0) {
        return (
          <>
            {head}, <UnflaggedLink>none of them flagged</UnflaggedLink>
          </>
        );
      }
      return (
        <>
          {head}:{" "}
          <FindingsToggle>
            <b>{flagged}</b> flagged
          </FindingsToggle>
          ,{" "}
          <UnflaggedLink>
            <b>{unflagged}</b> not flagged
          </UnflaggedLink>
        </>
      );
    }
    case "none-fail":
      return <>{opening ? "None" : "none"} fails this run</>;
    case "unapplied": {
      const wrote = model.report.run.mode === "generate_baseline";
      const who = opening ? "This run" : "this run";
      return (
        <>
          {who} {wrote ? "wrote a baseline, so it applied no " : "applied no "}
          <Flag text={gateFlag("fail_on", clause.failOn).text} />; <b>{clause.meets}</b>{" "}
          {clause.meets === 1 ? "meets" : "meet"} it
        </>
      );
    }
  }
}

/** The line under the lead figure: its subject opens level 1; the counts after it filter. */
function LeadClause({
  clause,
  lead,
}: {
  clause: GateClause;
  lead: (subject: ComponentChildren) => ComponentChildren;
}) {
  switch (clause.kind) {
    case "failing": {
      const { total, flagged, unflagged } = clause;
      const parts: ComponentChildren[] = [];
      if (flagged > 0) {
        parts.push(
          <FindingsToggle key="flagged">
            <b>{flagged}</b> flagged
          </FindingsToggle>,
        );
      }
      if (unflagged > 0) {
        parts.push(
          <UnflaggedLink key="unflagged">
            <b>{unflagged}</b> not flagged
          </UnflaggedLink>,
        );
      }
      return (
        <>
          {lead(
            <>
              {total} fail{total === 1 ? "s" : ""} this run
            </>,
          )}
          : {parts.flatMap((part, i) => (i === 0 ? [part] : [", ", part]))}
        </>
      );
    }
    case "none-fail":
      return (
        <>
          {lead("None fails this run")}; <b>{clause.meets}</b> {clause.meets === 1 ? "meets" : "meet"} the
          fail-on but {clause.meets === 1 ? "is" : "are"} exempt
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

/** "Fails on priority high or higher", or the kind as lockrot wrote it. */
function thresholdSentence(failOn: string, kind: string | null): ComponentChildren {
  const threshold = failOnThreshold({ failOn, failOnKind: kind });
  if (threshold === null) return null;
  if (threshold.startsWith("fails ")) return <>{`F${threshold.slice(1)}`}. </>;
  return (
    <>
      Another kind of threshold, <code className="mono">{kind}</code>, as lockrot wrote it.{" "}
    </>
  );
}

function FailOnText({ gate }: { gate: RunGate }) {
  const { model } = useReport();
  const failOn = gate.failOn ?? "";
  const { meets, failing, failingFlagged, failingUnflagged, unflaggedVerdicts } = gate;
  const threshold = thresholdSentence(failOn, model.report.run.failOnKind);
  if (!gate.failOnApplied) {
    const wrote = model.report.run.mode === "generate_baseline";
    return (
      <>
        {threshold}
        {wrote
          ? "This run wrote a baseline, so it applied it to no package"
          : "This run applied it to no package"}
        {meets > 0 && <>; {plural(meets, "package meets", "packages meet")} it</>}.
      </>
    );
  }
  if (meets === 0) {
    return (
      <>
        {threshold}
        No package meets it.
      </>
    );
  }
  const split =
    failingUnflagged === 0 ? null : (
      <>
        : {failingFlagged} flagged and {failingUnflagged} not flagged (
        {unflaggedVerdicts.map((verdict, i) => (
          <span key={verdict}>
            {i > 0 && ", "}
            <span className="mono">{verdict}</span>
          </span>
        ))}
        )
      </>
    );
  const outcome =
    failing === meets ? (
      <>, and {meets === 1 ? "it fails" : "all fail"}</>
    ) : failing === 0 ? (
      <>, and none fails</>
    ) : (
      <>
        : {failing} fail{failing === 1 ? "s" : ""}
      </>
    );
  return (
    <>
      {threshold}
      {plural(meets, "package meets", "packages meet")} it{outcome}
      {split}.
    </>
  );
}

function StrictText() {
  const { model } = useReport();
  const n = networkNotes(model.report);
  return (
    <>
      A network lookup failed, and this run fails when one does.{" "}
      {n === null
        ? "The run notes on Run data say which."
        : n > 0 && `${plural(n, "run note names", "run notes name")} the failed lookups, on Run data.`}
    </>
  );
}

const KNOWN_MODES: readonly string[] = ["check", "generate_baseline"];

/** Level 1: each cause, each exemption with its count, an unknown mode or kind as written. */
function GateDetails({ gate }: { gate: RunGate }) {
  const { model } = useReport();
  const { mode } = model.report.run;
  const rows: { key: string; term: ComponentChildren; text: ComponentChildren }[] = [];
  const causes = [...gate.causes];
  if (!causes.includes("fail_on") && gate.failOn !== null && gate.failOn !== "none") causes.push("fail_on");
  for (const cause of causes) {
    const flag = gateFlag(cause, gate.failOn);
    const term = flag.known ? <Flag text={flag.text} /> : <code className="mono">{flag.text}</code>;
    const text =
      cause === "fail_on" ? (
        <FailOnText gate={gate} />
      ) : cause === "strict_network" ? (
        <StrictText />
      ) : (
        "A cause this page has no words for, as lockrot wrote it."
      );
    rows.push({ key: `cause:${cause}`, term, text });
  }
  for (const line of exemptWords(gate, baselineExemption(model))) {
    rows.push({
      key: `exempt:${line.by}`,
      term:
        line.by === "baseline" ? (
          "exempt by the baseline"
        ) : (
          <>
            exempt: <code className="mono">{line.by}</code>
          </>
        ),
      text: `${line.text}.`,
    });
  }
  if (mode !== null && !KNOWN_MODES.includes(mode)) {
    rows.push({
      key: "mode",
      term: "mode",
      text: (
        <>
          <code className="mono">{mode}</code>: another kind of run, as lockrot wrote it.
        </>
      ),
    });
  }
  return (
    <dl className="gate-l1">
      {rows.map((row) => (
        <div key={row.key}>
          <dt>{row.term}</dt>
          <dd>{row.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The "Why" that ends the summary's gate clause, the subject that opens it on a line of its own,
 *  and the panel either opens under the sentence. */
export function useGateWhy(gate: RunGate | null): {
  button: ComponentChildren;
  lead: (subject: ComponentChildren) => ComponentChildren;
  panel: ComponentChildren;
} {
  const id = `${useId()}-gate-why`;
  const { open, toggle, printed } = useDisclosure(WHY_KEY);
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
  if (gate === null) return { button: null, lead, panel: null };
  return {
    lead,
    button: printed ? null : <DisclosureButton label="Why" open={open} controls={id} onToggle={toggle} />,
    panel: (
      <DisclosurePanel id={id} open={open} className="gate-why">
        <GateDetails gate={gate} />
      </DisclosurePanel>
    ),
  };
}

/** A row's mark: the word the eye reads and the words a screen reader hears for it. */
export function rowMarkWords(mark: FindingGateMark): { shown: string; spoken: string } | null {
  switch (mark.kind) {
    case "fails":
      return { shown: "fails", spoken: "fails this run" };
    case "exempt":
      return mark.by === "baseline"
        ? { shown: "accepted", spoken: "meets the fail-on, accepted by the baseline" }
        : { shown: `exempt: ${mark.by}`, spoken: `meets the fail-on, exempt: ${mark.by}` };
    case "unapplied":
      return null;
  }
}

/** One of a row's copies of its mark (gateFit.ts shows the one that fits); the row's description
 *  says it once, so each copy is hidden from a screen reader. */
export function RowGateMark({ mark, at }: { mark: FindingGateMark; at: GateSpot }) {
  const words = rowMarkWords(mark);
  if (words === null) return null;
  return (
    <span className={`gate-mark is-${mark.kind} gate-at-${at}`} aria-hidden="true">
      {words.shown}
    </span>
  );
}

/** A finding's own gate, where its row or its detail says it; `id` lets the row describe itself by it. */
export function GateMark({ finding, id, meets = false }: { finding: Finding; id?: string; meets?: boolean }) {
  const { model } = useReport();
  const mark = findingGateMark(model, finding);
  if (mark === null) return null;
  const failOn = model.report.run.failOn;
  const why =
    meets && failOn !== null ? (
      <span className="gate-meets">
        {" · "}meets <Flag text={gateFlag("fail_on", failOn).text} />
      </span>
    ) : null;
  switch (mark.kind) {
    case "fails":
      return (
        <span className="gate-mark is-fails" id={id}>
          fails<span className={meets ? undefined : "vh"}> this run</span>
          {why}
        </span>
      );
    case "exempt":
      return (
        <span className="gate-mark is-exempt" id={id}>
          {!meets && <span className="vh">meets the fail-on, but </span>}exempt: {mark.by}
          {why}
        </span>
      );
    case "unapplied":
      return meets && failOn !== null ? (
        <span className="gate-mark is-exempt" id={id}>
          meets <Flag text={gateFlag("fail_on", failOn).text} />, not applied by this run
        </span>
      ) : null;
  }
}
