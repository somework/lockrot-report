import type { Finding, Run } from "../../model/report";
import { gradeTone, shownPills, type BaselineMark } from "../../domain/findingRow";
import { toneClass } from "../common/common";
import "./flagPills.css";

function Mark({ mark }: { mark: BaselineMark }) {
  if (mark.tick) {
    return (
      <span className="fp-mark" title={mark.hidden}>
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 5.2l2.4 2.4 4.6-5" />
        </svg>
        <span className="vh">{mark.hidden}</span>
      </span>
    );
  }
  return (
    <span className="fp-mark">
      <span className="fp-dot-mark" aria-hidden="true" />
      {mark.word}
      <span className="vh">{mark.hidden}</span>
    </span>
  );
}

/**
 * One pill per flag (SPEC §7.9.5): the flag word in its band's tone, the qualifier in ink, the
 * baseline mark. An accepted flag is a dashed grey pill, last, that says "accepted" in words.
 * `hideAccepted` is the rail's view toggle.
 */
export function FlagPills({
  finding,
  run,
  hideAccepted = false,
}: {
  finding: Finding;
  run: Run;
  hideAccepted?: boolean;
}) {
  const pills = shownPills(finding, run, hideAccepted);
  return (
    <>
      {pills.map((pill) => (
        <span
          key={pill.id}
          className={pill.accepted ? "fp is-accepted" : `fp ${toneClass(gradeTone(pill.band))}`}
          title={pill.title ?? undefined}
        >
          <span className="fp-word">{pill.id}</span>
          <span className="fp-sep" aria-hidden="true">
            ·
          </span>
          <span className="fp-q">{pill.word}</span>
          {pill.noFix !== null && <span className="fp-nofix">{pill.noFix}</span>}
          {pill.mark !== null && <Mark mark={pill.mark} />}
        </span>
      ))}
    </>
  );
}
