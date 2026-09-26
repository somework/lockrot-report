import { Fragment, type ComponentChildren } from "preact";
import type { Model } from "../../model/types";
import { useReport } from "../context";
import "./pkg-mention.css";

const LOCKS = new WeakMap<Model, ReadonlySet<string>>();

/** Every package name the document lists, once per model. */
function lockNames(model: Model): ReadonlySet<string> {
  const cached = LOCKS.get(model);
  if (cached) return cached;
  const names = new Set(model.report.findings.map((f) => f.package));
  LOCKS.set(model, names);
  return names;
}

/** Whether `name` is a package this lock lists — the only names a mention may open. */
export function useInLock(): (name: string) => boolean {
  const { model } = useReport();
  const names = lockNames(model);
  return (name) => names.has(name);
}

/**
 * A package named inside a sentence (PD-PROSE-1, DESIGN.md §5): when the lock lists it, a button
 * that opens it, through the same `select` every row sends — so the address, the focus and the
 * detail follow the rules they already follow; otherwise, and for the package already open, the
 * same words unlinked. `className` is the look the sentence already gives the name (a serif
 * answer's mono, a radius sentence's bold); the link adds only its dotted underline.
 */
export function PkgMention({
  name,
  className,
  children,
}: {
  name: string;
  className?: string;
  /** What to show, when it is not the name itself (a name split for wrapping). */
  children?: ComponentChildren;
}) {
  const { state, dispatch } = useReport();
  const inLock = useInLock();
  const shown = children ?? name;
  if (!inLock(name) || state.pkg === name) return <span className={className}>{shown}</span>;
  return (
    <button
      type="button"
      className={className ? `${className} pkg-mention` : "pkg-mention"}
      title={`Open ${name}`}
      onClick={() => {
        dispatch({ type: "select", pkg: name });
      }}
    >
      {shown}
    </button>
  );
}

/** A word's punctuation split off: "(symfony/yaml)," is "(", "symfony/yaml", "),". */
export const PUNCTUATED = /^([("'“‘[]*)(.*?)([)"'”’\].,;:!?]*)$/;

/**
 * A plain sentence with every package the lock lists made a `PkgMention` (PD-PROSE-1), its
 * punctuation left outside the link; every other word as written.
 */
export function MentionProse({ text }: { text: string }) {
  const inLock = useInLock();
  const tokens = text.split(/(\s+)/);
  if (!tokens.some((token) => inLock(PUNCTUATED.exec(token)?.[2] ?? ""))) return <>{text}</>;
  return (
    <>
      {tokens.map((token, index) => {
        const [, before = "", core = "", after = ""] = PUNCTUATED.exec(token) ?? [];
        if (core === "" || !inLock(core)) return token;
        return (
          <Fragment key={index}>
            {before}
            <PkgMention name={core} />
            {after}
          </Fragment>
        );
      })}
    </>
  );
}
