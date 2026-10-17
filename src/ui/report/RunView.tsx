import { useId } from "preact/hooks";
import {
  acceptedUnchecked,
  advisoryLookup,
  baselineFacts,
  noteRows,
  RUN_WORDS,
  runFacts,
  thresholdRows,
} from "../../domain/runTab";
import {
  bandRuler,
  liveExample,
  scorePanelParts,
  scoreTables,
  type ScoreTable,
} from "../../domain/scorePanel";
import { verdictTone } from "../../domain/findingRow";
import type { Report2 } from "../../model/report";
import { OutLink, toneClass } from "../common/common";
import { useReport } from "../context";
import { usePrinted } from "../print/printContext";
import "../views/views.css";
import { ScoreBar } from "./ScoreBar";
import { SCORE_SECTION_ID } from "./ScoreModelLink";
import { GateLine } from "./Overview";
import { useReport2 } from "./useReport";
import "./run.css";

const pct = (share: number): string => `${share * 100}%`;

function Ruler({ model }: { model: Report2["run"]["score_model"] }) {
  const { zones, ticks } = bandRuler(model);
  return (
    <div className="run2-ruler" aria-hidden="true">
      <div className="run2-ruler-bands">
        {zones.map(({ verdict, from, to }) => (
          <i
            key={verdict}
            className={toneClass(verdictTone(model, verdict))}
            style={{ left: pct(from), width: pct(Math.max(0, to - from)) }}
          >
            {verdict}
          </i>
        ))}
      </div>
      <div className="run2-ruler-ticks">
        {ticks.map(({ at, text }) => (
          <span
            key={text}
            className={at === 0 ? "is-start" : at === 1 ? "is-end" : undefined}
            style={{ left: pct(at) }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

function Table({ table, model }: { table: ScoreTable; model: Report2["run"]["score_model"] }) {
  const id = useId();
  return (
    <div className="run2-table-wrap" role="region" aria-labelledby={id} tabIndex={0}>
      <table className="run2-table">
        <caption id={id}>{table.caption}</caption>
        <thead>
          <tr>
            {table.head.map((cell, index) => (
              <th key={index} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row[0]?.text}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row">
                    {cell.text}
                  </th>
                ) : (
                  <td
                    key={index}
                    className={
                      cell.band === undefined
                        ? undefined
                        : `run2-band ${toneClass(verdictTone(model, cell.band))}`
                    }
                  >
                    {cell.text}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The score of one finding of this report, drawn with the Findings row's bar. */
function Example({ report, opened }: { report: Report2; opened: string | null }) {
  const { finding, text } = liveExample(report, opened);
  return (
    <p className="run2-example">
      <span className="run2-example-text">{text}</span>
      {finding !== null && <ScoreBar score={finding.score} run={report.run} />}
    </p>
  );
}

function ScoreWorks({ report, opened }: { report: Report2; opened: string | null }) {
  const { run } = report;
  const parts = scorePanelParts(run);
  const tables = scoreTables(run.score_model);
  const printed = usePrinted();
  return (
    <section className="sect run2-score" id={SCORE_SECTION_ID} tabIndex={-1} aria-label={parts.title}>
      <h3>{parts.title}</h3>
      <Ruler model={run.score_model} />
      <p className="run2-caption">{parts.bands}</p>
      <p className="run2-caption">{parts.zero}</p>
      <Example report={report} opened={opened} />
      <Table table={tables.weights} model={run.score_model} />
      <Table table={tables.advisories} model={run.score_model} />
      <p className="run2-caption">{parts.fixes}</p>
      <details className="run2-rules" open={printed ? true : undefined}>
        <summary>{RUN_WORDS.rules(parts.rules.length)}</summary>
        <ol className="run2-rule-list">
          {parts.rules.map((rule) => (
            <li key={rule.id} className={rule.muted ? "run2-rule is-muted" : "run2-rule"}>
              <span className="run2-rule-no">{rule.stage}</span>
              <span className="run2-rule-body">
                <OutLink href={rule.href}>{rule.known ? rule.label : <code>{rule.label}</code>}</OutLink>
                {rule.text !== "" && <span className="run2-rule-text"> {rule.text}</span>}
              </span>
              {rule.used !== "" && <span className="run2-rule-used">{rule.used}</span>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function Lookup({ run }: { run: Report2["run"] }) {
  const lookup = advisoryLookup(run);
  return (
    <section className="sect">
      <h3>{RUN_WORDS.lookup}</h3>
      <p className="run2-line">{lookup.scope}</p>
      <p className="run2-line">{lookup.asked}</p>
      <ul className="run2-rows">
        {lookup.repositories.map((row, index) => (
          <li key={index}>{row}</li>
        ))}
      </ul>
      {lookup.other !== null && <p className="run2-line">{lookup.other}</p>}
    </section>
  );
}

function Notes({ report }: { report: Report2 }) {
  const notes = noteRows(report);
  if (notes.length === 0) return null;
  return (
    <section className="sect">
      <h3>{RUN_WORDS.notes}</h3>
      <ul className="run2-rows">
        {notes.map((note, index) => (
          <li key={index}>
            {note.text}
            {note.docs !== null && (
              <>
                {" · "}
                <OutLink href={note.docs}>{RUN_WORDS.noteDocs}</OutLink>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AcceptedUnchecked({ report }: { report: Report2 }) {
  const accepted = acceptedUnchecked(report);
  if (accepted === null) return null;
  return (
    <section className="sect">
      <h3>{RUN_WORDS.acceptedUnchecked}</h3>
      <p className="run2-line">{accepted.head}</p>
      <ul className="run2-rows">
        {accepted.rows.map((row, index) => (
          <li key={index}>{row}</li>
        ))}
      </ul>
    </section>
  );
}

function KeyValues({ head, rows }: { head: string; rows: readonly { key: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="sect">
      <h3>{head}</h3>
      <dl className="kv">
        {rows.map(({ key, value }) => (
          <div key={key} className="run2-kv-row">
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Baseline({ report }: { report: Report2 }) {
  const baseline = baselineFacts(report);
  if (baseline === null) return null;
  return (
    <section className="sect run2-baseline">
      <h3>{RUN_WORDS.baseline}</h3>
      <p className="run2-line">{baseline.head}</p>
      {baseline.stale.length > 0 && (
        <>
          <p className="run2-line">{RUN_WORDS.stale}</p>
          <ul className="run2-rows">
            {baseline.stale.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The Run data tab of a report-2 document (SPEC §7.9.16). */
export function RunView2() {
  const { report } = useReport2();
  const { state } = useReport();
  const headingId = useId();
  return (
    <section className="run-sections run2" data-surface="run" aria-labelledby={headingId}>
      <h2 className="vh" id={headingId}>
        {RUN_WORDS.tab}
      </h2>
      <KeyValues head={RUN_WORDS.facts} rows={runFacts(report)} />
      <ScoreWorks report={report} opened={state.example} />
      <Lookup run={report.run} />
      <Baseline report={report} />
      <Notes report={report} />
      <AcceptedUnchecked report={report} />
      <section className="sect">
        <h3>{RUN_WORDS.gate}</h3>
        <GateLine report={report} className="overview2-gate" />
      </section>
      <KeyValues head={RUN_WORDS.thresholds} rows={thresholdRows(report.run)} />
    </section>
  );
}
