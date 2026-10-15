import type { GateFlag, GateHeadline } from "../../domain/gate";
import { Flag } from "./GateFlag";
import "./gate.css";

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
  const head = `${who} ${verb}`;
  const tail = [
    ...flags.map((flag) => flag.text),
    ...(unapplied === null ? [] : [`${unapplied} not applied`]),
  ];
  return tail.length === 0 ? head : `${head} · ${tail.join(" · ")}`;
}

/** The header's fact: "this run fails · --fail-on=high". Words only; the summary explains. Header.tsx
 *  hides the flags from sight where they cost a line; `data-said`: the summary names them anyway. */
export function GateHeadlineText({ words }: { words: GateHeadline }) {
  const { who, verb, flags, unapplied, said } = words;
  return (
    <span className="gate-fact" title={headlineTitle(words)} data-said={said ? "" : undefined}>
      {who} <b className={verb === "fails" ? "gate-word is-fails" : "gate-word"}>{verb}</b>
      {(flags.length > 0 || unapplied !== null) && (
        <span className="gate-fact-more">
          <Sep />
          <FlagList flags={flags} separator=" · " />
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
