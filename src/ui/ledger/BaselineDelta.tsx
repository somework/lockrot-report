import type { ComponentChildren } from "preact";
import { baselineDelta, type BaselineDelta as Delta } from "../../domain/baseline";
import { filterTitle } from "../common/common";
import { useReport } from "../context";
import "../views/baseline.css";

/** How many names the sentence spells out before it says "N of its packages" and points at Run
 *  data, where every one is listed. Three is what a sentence carries without becoming a list. */
const NAMES_IN_SENTENCE = 3;

type Bucket = "new" | "worsened" | "known";

/**
 * One count in the sentence that is also the "Since" rail row it names: pressing it narrows the
 * list below to those findings, pressing it again clears that — the rail's own toggle, the same
 * `since` filter and fragment key, so the two can never disagree. A zero is plain text: a filter
 * to nothing is no answer. A document without per-finding state cannot filter, so it prints the
 * count and nothing more.
 */
function Count({
  bucket,
  count,
  filterable,
  children,
}: {
  bucket: Bucket;
  count: number;
  filterable: boolean;
  children: ComponentChildren;
}) {
  const { state, dispatch } = useReport();
  // New and worsened wear the baseline's own accent (PD-BASELINE-7), never a priority's tone: red
  // and orange already mean critical and high on every row this sentence sits above.
  const toned = bucket === "known" ? "bl-count" : "bl-count bl-change";
  if (count === 0 || !filterable) {
    return (
      <span className={toned}>
        <b>{count}</b> {children}
      </span>
    );
  }
  const pressed = state.filters.since.includes(bucket);
  const label = bucket === "known" ? "the findings the baseline already accepts" : `the ${bucket} findings`;
  return (
    <button
      type="button"
      className={`${toned} bl-toggle`}
      aria-pressed={pressed}
      title={filterTitle(label, pressed)}
      onClick={() => {
        dispatch({ type: "toggle", group: "since", key: bucket });
      }}
    >
      <b>{count}</b> {children}
    </button>
  );
}

/** "doctrine/reflection, swiftmailer/swiftmailer and symfony/swiftmailer-bundle" */
function Names({ names }: { names: readonly string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <span key={name}>
          {i === 0 ? "" : i === names.length - 1 ? " and " : ", "}
          <span className="bl-pk">{name}</span>
        </span>
      ))}
    </>
  );
}

/** The quieter line under the answer: the baseline's entries for packages the lock no longer holds
 *  (lockrot's `stale`, which the page calls "gone" so it never reads as the verdict of the same
 *  name). Not part of the answer's sentence — none of them is in the list below it. */
function Gone({ delta }: { delta: Delta }) {
  const { dispatch } = useReport();
  const n = delta.gone.length;
  if (n === 0) return null;
  const lead = `${n === 1 ? "One entry" : `${n} entries`} in it ${n === 1 ? "is" : "are"} gone from the lock`;
  return (
    <p className="bl-gone-note">
      {n <= NAMES_IN_SENTENCE ? (
        <>
          {lead}: <Names names={delta.gone} />.
        </>
      ) : (
        <>
          {lead} —{" "}
          <button
            type="button"
            className="bl-more"
            onClick={() => {
              dispatch({ type: "view", view: "run" });
            }}
          >
            listed on Run data
          </button>
          .
        </>
      )}
    </p>
  );
}

/**
 * The baseline's delta line (PD-BASELINE-1, DESIGN.md §5): the answer a reviewer with a baseline
 * opens the page for — what is new, what got worse, what the file already accepts, what it lists
 * that has left the lock — in the serif the band's other answers use. PD-BASELINE-7 moved it from
 * the top of the Findings list into the summary band, straight under the lead: it sat under the
 * figure, the waffle and three panels, fourth in line for the one question a baseline run is opened
 * to answer. Every number is a count lockrot recorded (`domain/baseline.ts`); nothing here says what
 * the run's exit code was.
 */
export function BaselineDelta() {
  const { model } = useReport();
  const delta = baselineDelta(model);
  if (delta === null) return null;
  const { filterable } = delta;
  const changed = delta.new + delta.worsened;

  return (
    <div className="bl-top">
      <p className="bl-answer">
        Against <span className="bl-path">{delta.path || "the baseline"}</span>:{" "}
        {changed === 0 ? (
          <>nothing new or worsened since it was written</>
        ) : (
          <>
            <Count bucket="new" count={delta.new} filterable={filterable}>
              new
            </Count>{" "}
            and{" "}
            <Count bucket="worsened" count={delta.worsened} filterable={filterable}>
              worsened
            </Count>{" "}
            since it was written
          </>
        )}
        ,{" "}
        <Count bucket="known" count={delta.known} filterable={filterable}>
          already accepted
        </Count>
        .
      </p>
      <Gone delta={delta} />
    </div>
  );
}
