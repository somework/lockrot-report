import { useId } from "preact/hooks";
import type { Finding, Report2 } from "../../model/report2";
import { isScoreGraded } from "../../model/report2";
import { DETAIL_WORDS, whyTitle } from "../../domain/detailWords";
import { whyBlock, type WhyLineKind } from "../../domain/scoreWhy";
import { bandRuler, legendText, whyBar, type BarSegment } from "../../domain/whyBar";
import { TONE } from "../../domain/vocab";
import { toneClass } from "../common/common";
import { DisclosureButton, useDisclosure } from "../common/Disclosure";
import { useReport } from "../context";

export const WHY_KEY = "why-arithmetic";

/** Shown at once (design 2A): the rest is the arithmetic, on click. */
const LEVEL_0: ReadonlySet<WhyLineKind> = new Set(["opening", "after-the-move"]);

const at = (name: string, x: number): Record<string, string> => ({ [name]: `${x}%` });

function segmentClass(segment: BarSegment): string {
  const tone = toneClass(TONE(segment.band ?? ""));
  return `d2-seg is-${segment.role} ${tone}${segment.cut ? " is-cut" : ""}`;
}

function Bar({ finding, report }: { finding: Finding; report: Report2 }) {
  const { score } = finding;
  if (!isScoreGraded(score)) return null;
  const bar = whyBar(score, report.run);
  const ruler = bandRuler(report.run);
  return (
    <>
      <p className="vh">{legendText(bar)}</p>
      <div className="d2-why-figure" aria-hidden="true">
        <div className={`d2-why-bar${bar.over ? " is-over" : ""}`} title={score.text}>
          {bar.segments.map((segment, i) => (
            <span key={i} className={segmentClass(segment)} style={at("--w", segment.width)} />
          ))}
        </div>
        <div className="d2-why-legend">
          {bar.segments.map((segment, i) => (
            <span key={i} className="d2-why-legend-item">
              <span className={`d2-swatch ${segmentClass(segment)}`} />
              {segment.flag} <b>{segment.contribution}</b>
            </span>
          ))}
        </div>
        <div className="d2-ruler">
          <div className="d2-ruler-zones">
            {ruler.zones.map((zone) => (
              <i
                key={zone.verdict}
                className={toneClass(TONE(zone.verdict))}
                style={{ ...at("--from", zone.from), ...at("--w", zone.width) }}
              />
            ))}
          </div>
          <span className="d2-ruler-tick is-start">0</span>
          {ruler.ticks.map((tick) => (
            <span
              key={tick.floor}
              className={`d2-ruler-tick ${toneClass(TONE(tick.verdict))}`}
              style={at("--at", tick.at)}
            >
              {tick.floor} <em>{tick.verdict}</em>
            </span>
          ))}
          <span className="d2-ruler-tick is-end">{ruler.max}</span>
        </div>
      </div>
    </>
  );
}

/** "Why <verdict>" (SPEC §7.9.8, design 2A): the bar is `aria-hidden`, and its lines are its text. */
export function ScoreWhy({ finding, report }: { finding: Finding; report: Report2 }) {
  const { dispatch } = useReport();
  const disclosure = useDisclosure(WHY_KEY);
  const listId = `${useId()}-why`;
  const [header, ...lines] = whyBlock(finding, report);
  const graded = isScoreGraded(finding.score);
  const arithmetic = graded ? lines.filter((line) => !LEVEL_0.has(line.kind)) : [];
  const shown = (kind: WhyLineKind): boolean => !graded || LEVEL_0.has(kind) || disclosure.open;

  return (
    <section
      className={`detail-section d2-why ${toneClass(TONE(finding.verdict))}`}
      aria-labelledby={`${listId}-h`}
    >
      <div className="d2-why-head">
        <h3 id={`${listId}-h`}>{whyTitle(finding.verdict)}</h3>
        <span className="d2-why-header">{header?.text}</span>
      </div>
      <Bar finding={finding} report={report} />
      <ul className="d2-why-lines" id={listId}>
        {lines.map((line, i) => (
          <li key={i} className={`d2-why-line is-${line.kind}`} hidden={!shown(line.kind)}>
            {line.text}
          </li>
        ))}
      </ul>
      <div className="d2-why-foot">
        {arithmetic.length > 0 && !disclosure.printed && (
          <DisclosureButton
            label={DETAIL_WORDS.showArithmetic}
            open={disclosure.open}
            controls={listId}
            onToggle={disclosure.toggle}
          />
        )}
        <button
          type="button"
          className="d2-link"
          onClick={() => {
            dispatch({ type: "view", view: "run", keepDetail: false });
          }}
        >
          {DETAIL_WORDS.howScoreWorks} <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}
