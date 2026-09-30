import type { ComponentChildren } from "preact";
import { plural } from "../../domain/format";
import { failOnThreshold } from "../../domain/run";
import { baselineExemption, exemptWords, gateFlag, networkNotes, type RunGate } from "../../domain/gate";
import type { Model } from "../../model/types";
import { useReport } from "../context";
import { Flag } from "./GateFlag";

const KNOWN_MODES: readonly string[] = ["check", "generate_baseline"];

interface Row {
  readonly key: string;
  readonly term: ComponentChildren;
  readonly text: ComponentChildren;
}

/** "Fails on priority high or higher.", or the kind as lockrot wrote it. */
function threshold(failOn: string, kind: string | null): ComponentChildren {
  const words = failOnThreshold({ failOn, failOnKind: kind });
  if (words === null) return null;
  if (words.startsWith("fails ")) return <>{`F${words.slice(1)}`}. </>;
  return (
    <>
      Another kind of threshold, <code className="mono">{kind}</code>, as lockrot wrote it.{" "}
    </>
  );
}

/** How many of the failing ones the Findings tab lists, and the verdicts of the rest. */
function split(gate: RunGate): ComponentChildren {
  const { failingFlagged: flagged, failingUnflagged: unflagged, unflaggedVerdicts } = gate;
  if (unflagged === 0) return null;
  const verdicts = unflaggedVerdicts.map((verdict, i) => (
    <span key={verdict}>
      {i > 0 && ", "}
      <span className="mono">{verdict}</span>
    </span>
  ));
  if (flagged === 0) {
    return (
      <>
        {" "}
        {unflagged === 1 ? "It is not" : "None of them is"} flagged ({verdicts}).
      </>
    );
  }
  return (
    <>
      {" "}
      Of those, {flagged} {flagged === 1 ? "is" : "are"} flagged and {unflagged}{" "}
      {unflagged === 1 ? "is" : "are"} not ({verdicts}).
    </>
  );
}

function failOnText(gate: RunGate, model: Model): ComponentChildren {
  const failOn = gate.failOn ?? "";
  const { meets, failing } = gate;
  const lead = threshold(failOn, model.report.run.failOnKind);
  if (gate.failOnApplied === false) {
    const why = model.report.run.mode === "generate_baseline" ? "This run wrote a baseline, so it" : "It";
    return (
      <>
        {lead}
        {why} was not applied
        {meets > 0 && <>; {plural(meets, "package meets", "packages meet")} it</>}.
      </>
    );
  }
  if (meets === 0) return <>{lead}No package meets it.</>;
  const outcome =
    failing === meets
      ? meets === 1
        ? ", and it fails"
        : ", and all fail"
      : failing === 0
        ? ", and none fails"
        : `: ${failing} fail`;
  return (
    <>
      {lead}
      {plural(meets, "package meets", "packages meet")} it{outcome}.{split(gate)}
    </>
  );
}

function strictText(model: Model): ComponentChildren {
  const notes = networkNotes(model.report);
  const which =
    notes === null
      ? " The run notes on Run data say which."
      : notes.failed > 0
        ? ` ${notes.failed} of the ${notes.of} run notes name ${notes.failed === 1 ? "it" : "them"}, marked “network failure” on Run data.`
        : "";
  return <>A network lookup failed, and this run fails when one does.{which}</>;
}

function causeRows(gate: RunGate, model: Model): readonly Row[] {
  const causes = [...gate.causes];
  if (!causes.includes("fail_on") && gate.failOn !== null && gate.failOn !== "none") causes.push("fail_on");
  return causes.map((cause) => {
    const flag = gateFlag(cause, gate.failOn);
    const term = flag.known ? <Flag text={flag.text} /> : <code className="mono">{flag.text}</code>;
    const text =
      cause === "fail_on"
        ? failOnText(gate, model)
        : cause === "strict_network"
          ? strictText(model)
          : "A cause this page has no words for, as lockrot wrote it.";
    return { key: `cause:${cause}`, term, text };
  });
}

function exemptRows(gate: RunGate, model: Model): readonly Row[] {
  return exemptWords(gate, baselineExemption(model)).map((line) => ({
    key: `exempt:${line.by}`,
    term:
      line.by === "baseline" ? (
        "accepted"
      ) : (
        <>
          exempt: <code className="mono">{line.by}</code>
        </>
      ),
    text: `${line.text}.`,
  }));
}

function modeRows(model: Model): readonly Row[] {
  const { mode } = model.report.run;
  if (mode === null || KNOWN_MODES.includes(mode)) return [];
  const text = (
    <>
      <code className="mono">{mode}</code>: another kind of run, as lockrot wrote it.
    </>
  );
  return [{ key: "mode", term: "mode", text }];
}

/** Level 1: each cause, each exemption with its count, an unknown mode or kind as written. */
export function GateDetails({ gate }: { gate: RunGate }) {
  const { model } = useReport();
  const rows = [...causeRows(gate, model), ...exemptRows(gate, model), ...modeRows(model)];
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
