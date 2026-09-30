import type { ComponentChildren, RefObject } from "preact";
import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Finding } from "../../model/types";
import {
  clampsNames,
  fanInDots,
  scaleSlots,
  sharedTail,
  type SharedEntry,
  type SharedTail,
} from "../../domain/sharedTail";
import { useReport } from "../context";
import { DisclosureButton, DisclosurePanel, useDisclosure } from "../common/Disclosure";
import { VerdictWord } from "./RadiusMarks";
import "./radius-shared.css";

const SHARED_KEY = "radius-shared";

/** A package named in a Blast radius footnote: opens its detail, as a Findings row does. */
export function OpenName({ name }: { name: string }) {
  const { dispatch } = useReport();
  return (
    <button
      type="button"
      className="rl-jump rl-pk"
      title={`Open ${name}`}
      onClick={() => {
        dispatch({ type: "select", pkg: name });
      }}
    >
      {name}
    </button>
  );
}

function more(max: number | null): ComponentChildren {
  return max === null ? null : <>, more than {max}</>;
}

function oneShare({ fanIn }: SharedEntry, max: number | null): ComponentChildren {
  if (fanIn !== null) {
    return (
      <>
        <b>{fanIn}</b> direct {fanIn === 1 ? "requirement shares" : "requirements share"} it{more(max)}
      </>
    );
  }
  if (max !== null) {
    return (
      <>
        more than <b>{max}</b> direct requirements share it
      </>
    );
  }
  return <>lockrot counts it under no direct requirement</>;
}

/** ", each shared by more than N direct requirements", where the requirements open level 1; each
 *  name already carries its own count. */
function manyShare(
  max: number | null,
  requirements: (words: string) => ComponentChildren,
): ComponentChildren {
  if (max === null) return <>: lockrot counts them under no {requirements("direct requirement")}</>;
  return (
    <>
      , each shared by more than <b>{max}</b> {requirements("direct requirements")}
    </>
  );
}

/** How many names the sentence spells out before "and N more", beside a wide table and a narrow one,
 *  so it keeps to two lines. The rest open with the dots. */
const NAMES_IN_LINE = 3;
const NAMES_IN_NARROW_LINE = 1;

function More({ n, className }: { n: number; className: string }) {
  if (n <= 0) return null;
  return (
    <span className={className}>
      {" "}
      and <b>{n}</b> more
    </span>
  );
}

/** Each name with its fan-in, whole on its line. */
function EntryNames({ entries }: { entries: readonly SharedEntry[] }) {
  const named = entries.slice(0, NAMES_IN_LINE);
  const narrow = NAMES_IN_NARROW_LINE;
  return (
    <>
      {named.map(({ finding, fanIn }, i) => (
        <span key={finding.package} className={i < narrow ? undefined : "rl-sh-wide"}>
          {i === 0 ? "" : i === entries.length - 1 ? " and " : ", "}
          <span className="fl-unit">
            <OpenName name={finding.package} />
            {fanIn !== null && <span className="rl-paren"> ({fanIn})</span>}
          </span>
        </span>
      ))}
      <More n={entries.length - named.length} className="rl-sh-wide" />
      <More n={entries.length - narrow} className="rl-sh-narrow" />
    </>
  );
}

/** One dot per direct requirement sharing it, filled up to the limit and hollow past it; the dashed
 *  tick is the limit, labelled on the first row only. */
function Dots({ fanIn, max, labelled }: { fanIn: number; max: number; labelled: boolean }) {
  const { filled, hollow, clipped } = fanInDots(fanIn, max);
  return (
    <span className={labelled ? "rl-sh-scale is-labelled" : "rl-sh-scale"} aria-hidden="true">
      {Array.from({ length: filled }, (_, i) => (
        <i key={`f${String(i)}`} className="rl-sh-dot" />
      ))}
      {Array.from({ length: hollow }, (_, i) => (
        <i key={`h${String(i)}`} className="rl-sh-dot is-past" />
      ))}
      {clipped && <span className="rl-sh-clip">…</span>}
      <i className="rl-sh-tick">{labelled && <span className="rl-sh-tick-label">at most {max}</span>}</i>
    </span>
  );
}

/** True while the clamped paragraph hides lines; a list that fits its lines needs no button. */
function useOverflows(clamped: boolean): [RefObject<HTMLParagraphElement>, boolean] {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!clamped || el === null) return undefined;
    const measure = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [clamped]);
  return [ref, overflows];
}

/** Every name is in the page; a long list shows its first lines until asked, and prints whole. */
function Names({ pkg, names, clamp }: { pkg: string; names: readonly string[]; clamp: boolean }) {
  const id = `${useId()}-names`;
  const { open, toggle, printed } = useDisclosure(`${SHARED_KEY}:${pkg}`);
  const clamped = clamp && !open;
  const [ref, overflows] = useOverflows(clamped);
  return (
    <div className="rl-sh-deps">
      <p ref={ref} id={id} className={clamped ? "rl-sh-names is-clamped" : "rl-sh-names"}>
        <span className="rl-sh-under">sits under </span>
        {names.map((name, i) => (
          <span key={name}>
            {i > 0 && " "}
            <span className="rl-sh-dep">
              {name}
              {i < names.length - 1 && ","}
            </span>
          </span>
        ))}
      </p>
      {clamp && !printed && (open || overflows) && (
        <DisclosureButton
          label={`All ${String(names.length)}`}
          open={open}
          controls={id}
          onToggle={toggle}
          className="rl-sh-all"
        />
      )}
    </div>
  );
}

function Entry({
  entry,
  max,
  many,
  first,
}: {
  entry: SharedEntry;
  max: number | null;
  many: boolean;
  first: boolean;
}) {
  const { finding, verdict, fanIn } = entry;
  const deps = finding.directDependents;
  return (
    <li className="rl-sh-item">
      {many && (
        <span className="rl-sh-name">
          <OpenName name={finding.package} /> <VerdictWord verdict={verdict} />
        </span>
      )}
      {fanIn !== null && max !== null ? <Dots fanIn={fanIn} max={max} labelled={first} /> : <span />}
      {fanIn !== null ? (
        <span className="rl-sh-n">
          <b>{fanIn}</b> share it
        </span>
      ) : (
        <span />
      )}
      {deps.length > 0 && <Names pkg={finding.package} names={deps} clamp={clampsNames(deps.length, max)} />}
    </li>
  );
}

function listClass({ entries, maxFanIn: max }: SharedTail): string {
  const drawn =
    max === null ? [] : entries.flatMap((e) => (e.fanIn === null ? [] : [fanInDots(e.fanIn, max)]));
  return [
    "rl-sh-list",
    entries.length > 1 ? "is-many" : "",
    drawn.length > 0 ? "is-labelled" : "",
    drawn.some((d) => d.clipped) ? "has-clip" : "",
  ]
    .filter((c) => c !== "")
    .join(" ");
}

function hasBody(tail: SharedTail): boolean {
  return (
    tail.entries.length > 1 ||
    tail.devLeftOut ||
    tail.entries.some(
      (e) => e.finding.directDependents.length > 0 || (e.fanIn !== null && tail.maxFanIn !== null),
    )
  );
}

/**
 * The flagged packages lockrot counts under no direct requirement (`unattributed`), under the table:
 * one sentence, and on request the dots against the limit and the requirements each sits under.
 */
export function SharedTailNote({ findings }: { findings: readonly Finding[] }) {
  const { model } = useReport();
  const base = useId();
  const { open, toggle, printed } = useDisclosure(SHARED_KEY);
  const tail = sharedTail(model, findings);
  if (tail === null) return null;
  const { entries, maxFanIn: max } = tail;
  const [lone] = entries;
  const many = entries.length > 1;
  const panelId = `${base}-shared`;
  const buttonId = `${base}-shared-btn`;
  const body = hasBody(tail);
  const slots =
    max === null
      ? 0
      : scaleSlots(
          entries.map((e) => e.fanIn),
          max,
        );
  const disclose = (label: string, name?: string): ComponentChildren =>
    body && !printed ? (
      <DisclosureButton
        id={buttonId}
        label={label}
        name={name}
        open={open}
        controls={panelId}
        onToggle={toggle}
      />
    ) : (
      label
    );
  return (
    <div className="rl-shared">
      <p className="rl-shared-line">
        {many || lone === undefined ? (
          <>
            <EntryNames entries={entries} /> are left out of Blast radius
            {manyShare(max, (words) => disclose(words, `${words}: who shares them`))}.
          </>
        ) : (
          <>
            <span className="fl-unit">
              <OpenName name={lone.finding.package} />{" "}
              <span className="rl-paren">
                (<VerdictWord verdict={lone.verdict} />)
              </span>
            </span>{" "}
            is left out of Blast radius: {oneShare(lone, max)}.
            {body && !printed && <> {disclose("Who shares it")}</>}
          </>
        )}
      </p>
      {body && (
        <DisclosurePanel
          id={panelId}
          open={open}
          className="rl-sh-panel"
          labelledBy={printed ? undefined : buttonId}
        >
          <ul
            className={listClass(tail)}
            style={{ "--rl-sh-slots": String(slots), "--rl-sh-max": String(max ?? 0) }}
          >
            {entries.map((entry, i) => (
              <Entry key={entry.finding.package} entry={entry} max={max} many={many} first={i === 0} />
            ))}
          </ul>
          {tail.devLeftOut && (
            <p className="rl-sh-note">Counted from require alone (require-dev not counted).</p>
          )}
        </DisclosurePanel>
      )}
    </div>
  );
}
