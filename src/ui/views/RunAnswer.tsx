import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Model } from "../../model/types";
import { activityTally, cacheAge, carries, utcMinute } from "../../domain/run";
import { plural } from "../../domain/format";
import { useReport } from "../context";
import "./run.css";

/** A word pair joined for a sentence: "a and b", "a, b and c". */
function listed(items: readonly ComponentChildren[]): ComponentChildren[] {
  return items.flatMap((item, index) => {
    if (index === 0) return [item];
    return [index === items.length - 1 ? " and " : ", ", item];
  });
}

/** The first sentence: which lockrot, which lock, against which PHP, whether require-dev, when. */
function whoWhatWhen(model: Model): ComponentChildren {
  const { report } = model;
  const { run } = report;
  const version = report.tool.version;
  const lock = run.lockFile ?? "lock";
  return (
    <>
      lockrot {version !== null && <b className="mono">{version}</b>} checked{" "}
      {report.packagesChecked !== null ? (
        <b>{plural(report.packagesChecked, "package", "packages")}</b>
      ) : (
        "the packages"
      )}{" "}
      in {run.project !== null && <>{run.project}’s </>}
      <span className="mono">{lock}</span>
      {run.targetPhp !== null && (
        <>
          {" "}
          against PHP <b className="mono">{run.targetPhp}</b>
        </>
      )}
      {report.includeDev !== null &&
        (report.includeDev ? ", require-dev included," : ", require-dev left out,")}{" "}
      and wrote this report on <b className="run-when">{utcMinute(report.generatedAt)}</b>.
    </>
  );
}

/** `text` with its first letter capitalised when it opens a sentence. */
function opening(text: string, first: boolean): string {
  return first ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** The second sentence: whether every lookup answered, and how fresh the repository activity was. */
function howComplete(model: Model): ComponentChildren {
  const { report } = model;
  const parts: ComponentChildren[] = [];
  if (report.networkFailures === true) {
    parts.push(
      <>
        <b className="run-warn">{opening("some network lookups failed", parts.length === 0)}</b>
        {report.notes.length > 0 && " (named below)"}
      </>,
    );
  } else if (report.networkFailures === false) {
    parts.push(opening("every network lookup answered", parts.length === 0));
  }
  const age = cacheAge(report);
  const lead = opening("the oldest cached repository activity it used", parts.length === 0);
  if (age !== null) {
    parts.push(
      age.before === null ? (
        <>
          {lead} dates from {utcMinute(age.oldest)}
        </>
      ) : (
        <>
          {lead} was <b>{age.before}</b> old
        </>
      ),
    );
  } else if (carries(report, "activity_cache_oldest_at")) {
    const tally = activityTally(model.details);
    if (tally.total > 0 && tally.fromCache === 0) {
      parts.push(
        opening("every repository answer in this file was fetched during the run", parts.length === 0),
      );
    }
  }
  if (parts.length === 0) return null;
  return <> {listed(parts)}.</>;
}

/** The third sentence: the gate the run was given, when the document says. */
function gate(model: Model): ComponentChildren {
  const failOn = model.report.run.failOn;
  if (failOn === null) return null;
  if (failOn === "none") return " It ran with no gate (--fail-on=none).";
  return (
    <>
      {" "}
      It ran with <b className="mono">--fail-on={failOn}</b>.
    </>
  );
}

/**
 * Run data's answer (PD-RUN-1, DESIGN.md §5): the run in one short serif paragraph — which lockrot,
 * how many packages of which lock, the PHP it checked against, whether require-dev was in, when it
 * wrote the report, whether every lookup answered and how old its cached activity was, and its gate.
 * A fact the document does not give is left out of the sentence; the list below says why.
 */
export function RunAnswer() {
  const { model } = useReport();
  // useId: the print document mounts a second Run data beside the screen's (PrintDocument.tsx).
  const headingId = useId();
  return (
    <section className="run-top" aria-labelledby={headingId}>
      <h2 className="run-eyebrow" id={headingId}>
        This run
      </h2>
      <p className="run-answer">
        {whoWhatWhen(model)}
        {howComplete(model)}
        {gate(model)}
      </p>
      <AbsentFields />
    </section>
  );
}

/**
 * PD-RUN-3: the document leaves out fields this page reads — named from what is absent in THIS
 * document (`report.absent`, normalize.ts) and the version and schema it states, never from a table
 * of which lockrot release added what. Only shown when something is absent.
 */
function AbsentFields() {
  const { model } = useReport();
  const { report } = model;
  const absent = report.absent;
  if (absent.length === 0) return null;
  const version = report.tool.version;
  const schema = report.tool.schema;
  const writer =
    version === null
      ? "lockrot"
      : schema === null
        ? `lockrot ${version}`
        : `lockrot ${version} (report schema ${schema})`;
  return (
    <p className="run-absent">
      <b>
        This report leaves out {absent.length === 1 ? "one field" : `${absent.length} fields`} this page
        reads:
      </b>{" "}
      {listed(
        absent.map((key) => (
          <code className="mono" key={key}>
            {key}
          </code>
        )),
      )}
      . It was written by {writer}; the rows below that need {absent.length === 1 ? "it" : "them"} say “not in
      this document”.
    </p>
  );
}
