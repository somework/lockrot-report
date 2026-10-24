import { useId, useState } from "preact/hooks";
import type { Finding, RepositoryMetadata, Run } from "../../model/report";
import { agesAsOf, DETAIL_WORDS } from "../../domain/detailWords";
import { verdictTone } from "../../domain/findingRow";
import { qualifiers, type Qualifiers, type ReachRow } from "../../domain/qualifierRows";
import { REACH_NAMES_SHOWN, REACH_NAMES_SHOWN_MAX } from "../../domain/sheetThresholds";
import { readingRich, verdictBlock } from "../../domain/verdictBlock";
import { toneClass } from "../common/common";
import { DisclosureButton } from "../common/Disclosure";
import { usePrinted } from "../print/printContext";
import { jumpTo, RichText, type JumpIds } from "./RichText";

const Name = ({ name }: { name: string }) => <span className="d3-name">{name}</span>;

/** One name inline; more as a list, past REACH_NAMES_SHOWN_MAX the rest behind "{n} more". */
function Names({ names }: { names: readonly string[] }) {
  const [opened, setOpen] = useState(false);
  const printed = usePrinted();
  const open = opened || printed;
  const listId = `${useId()}-names`;
  const shown = names.length <= REACH_NAMES_SHOWN_MAX ? names.length : REACH_NAMES_SHOWN;
  const rest = names.length - shown;
  return (
    <>
      <ul className="d3-namelist" id={listId}>
        {names.map((name, i) => (
          <li key={name} hidden={i >= shown && !open}>
            <Name name={name} />
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <DisclosureButton
          label={open ? DETAIL_WORDS.showFewer : DETAIL_WORDS.more.replace("{n}", String(rest))}
          open={open}
          controls={listId}
          onToggle={() => {
            setOpen(!open);
          }}
        />
      )}
    </>
  );
}

function Reach({ reach }: { reach: ReachRow }) {
  const [only] = reach.names;
  return (
    <>
      <span className="d3-q-line">{reach.where}</span>
      {reach.before !== null && <span className="d3-q-line">{reach.before}</span>}
      <span className="d3-q-line">
        {reach.how}
        {reach.names.length === 1 && only !== undefined && <Name name={only} />}
      </span>
      {reach.names.length > 1 && <Names names={reach.names} />}
      {reach.halving.map((line) => (
        <span key={line} className="d3-q-sub">
          {line}
        </span>
      ))}
    </>
  );
}

const Lines = ({ lines }: { lines: readonly string[] }) => (
  <>
    {lines.map((line) => (
      <span key={line} className="d3-q-line">
        {line}
      </span>
    ))}
  </>
);

function QualifierRows({ q }: { q: Qualifiers }) {
  const { gate, accepted } = q;
  const rows = [
    q.reach === null ? null : ([DETAIL_WORDS.reach, <Reach reach={q.reach} />] as const),
    q.origin === null ? null : ([DETAIL_WORDS.origin, q.origin] as const),
    q.notJudged === null ? null : ([DETAIL_WORDS.notJudged, q.notJudged] as const),
    q.unchecked.length === 0 ? null : ([DETAIL_WORDS.unchecked, <Lines lines={q.unchecked} />] as const),
    q.notRun.length === 0 ? null : ([DETAIL_WORDS.notRun, <Lines lines={q.notRun} />] as const),
    q.php === null && q.phpEdge.length === 0
      ? null
      : ([DETAIL_WORDS.php, <Lines lines={[...(q.php === null ? [] : [q.php]), ...q.phpEdge]} />] as const),
    accepted === null
      ? null
      : ([
          DETAIL_WORDS.accepted,
          <>
            {accepted.head}
            <span className="d3-q-sub">{accepted.reason}</span>
            {accepted.entry !== null && (
              <span className="d3-q-sub">
                <RichText rich={accepted.entry} />
              </span>
            )}
          </>,
        ] as const),
    [
      DETAIL_WORDS.gate,
      <>
        {gate.word !== "" && <b className={`d3-gate is-${gate.state}`}>{gate.word}</b>}
        {gate.rest}
        {gate.tripped !== null && <span className="d3-q-sub">{gate.tripped}</span>}
      </>,
    ] as const,
  ];
  return (
    <dl className="d3-qualifiers">
      {rows.map(
        (row) =>
          row !== null && (
            <div key={row[0]} className="d3-q">
              <dt>{row[0]}</dt>
              <dd>{row[1]}</dd>
            </div>
          ),
      )}
    </dl>
  );
}

/** The verdict block (SPEC §7.9.8.5): the anchor, the verdict line, the jump, the readings and the
 *  qualifier rows. */
export function VerdictBlock({
  finding,
  run,
  metadata,
  generatedAt,
  jumps,
}: {
  finding: Finding;
  run: Run;
  metadata: RepositoryMetadata | null;
  generatedAt: string;
  jumps: JumpIds;
}) {
  const id = `${useId()}-verdict`;
  const block = verdictBlock(finding, run, metadata);
  const inline = block.inline;
  return (
    <section
      className={`d3-verdict ${toneClass(verdictTone(run.score_model, finding.verdict))}`}
      aria-labelledby={id}
    >
      <h3 className="vh" id={id}>
        {DETAIL_WORDS.verdict}
      </h3>
      <p className="d2-asof">{agesAsOf(generatedAt)}</p>
      <p className="d3-verdict-line">
        <strong className="d3-grade">{block.grade}</strong>
        {block.opening}
        {inline !== null && (
          <span className="d3-inline">
            <RichText rich={readingRich(inline, false)} jumps={jumps} />
          </span>
        )}
      </p>
      {inline?.jump != null && jumps.branches !== undefined && (
        <p className="d3-verdict-jump d3-jump">
          <a
            className="lnk"
            href={`#${jumps.branches}`}
            onClick={(event) => {
              if (jumps.branches !== undefined) jumpTo(event, jumps.branches);
            }}
          >
            {inline.jump}
          </a>
        </p>
      )}
      {block.readings.length > 0 && (
        <ul className="d3-readings" aria-label={DETAIL_WORDS.otherFlags}>
          {block.readings.map((reading) => (
            <li key={reading.flag} className="d3-reading">
              <span className="d3-reading-flag">{reading.flag}</span>
              <p className="d3-reading-text">
                <RichText rich={readingRich(reading)} jumps={jumps} />
              </p>
            </li>
          ))}
        </ul>
      )}
      <QualifierRows q={qualifiers(finding, run)} />
    </section>
  );
}
