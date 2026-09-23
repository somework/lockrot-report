import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { DOCS_URL, SIGNAL_DEFS, SIGNAL_DOC, SIGNAL_NAMES, TONE, VERDICT_DEFS } from "../domain/vocab";
import { SIGNAL_IDS, VERDICTS } from "../model/types";
import { OutLink, toneClass } from "./common/common";
import { useReport } from "./context";

/** The nine verdicts, each in its tone, with this report's count beside it when there is one. */
function VerdictDefs() {
  const { model } = useReport();

  return (
    <dl className="deflist">
      {VERDICTS.map((verdict) => {
        const count = model.report.counts[verdict] ?? 0;
        return [
          <dt key={`t-${verdict}`} className={`term-toned ${toneClass(TONE(verdict))}`}>
            {verdict}
            {count > 0 && <span className="muted"> {count}</span>}
          </dt>,
          <dd key={`d-${verdict}`}>{VERDICT_DEFS[verdict]}</dd>,
        ];
      })}
    </dl>
  );
}

/** S1 to S10 in numeric order (DESIGN.md §5 M2: the legacy glossary left S10 out). */
function SignalDefs() {
  return (
    <dl className="deflist">
      {SIGNAL_IDS.map((id) => {
        const doc = SIGNAL_DOC[id];
        const name = SIGNAL_NAMES[id] ?? "";
        return [
          <dt key={`t-${id}`}>
            {id}{" "}
            {doc === undefined ? (
              <span className="term-name">{name}</span>
            ) : (
              <OutLink href={doc}>{name}</OutLink>
            )}
          </dt>,
          <dd key={`d-${id}`}>{SIGNAL_DEFS[id]}</dd>,
        ];
      })}
    </dl>
  );
}

/** The glossary's fixed prose is the legacy page's (report.html:129-162), word for word. */
function OrderNote() {
  return (
    <p className="small-note">
      Order used by <span className="mono">--fail-on</span> and the baseline: abandoned &gt; silent &gt;
      pinned &gt; left-behind &gt; old-promise &gt; stale &gt; unknown &gt; ok.{" "}
      <span className="mono">unknown</span> &mdash; a package lockrot could not check &mdash;{" "}
      <span className="mono">finished</span> and <span className="mono">ok</span> are never findings, and none
      of them fail a build.
    </p>
  );
}

function LibyearsSection() {
  return (
    <section className="glossary-sect">
      <h3>One number for the lock: libyears</h3>
      <p className="prose">
        For each package, the years between the release installed and the package's newest stable release,
        summed. It counts every drift, healthy patches included, so it says how far behind the lock is and
        nothing about why &mdash; it is not a verdict, and no priority reads it. A package is not measured
        when it is a branch snapshot, when no dated stable release is known for it, when it is not from a
        Composer repository, or when its metadata did not come; the Run tab counts each case.{" "}
        <OutLink href={`${DOCS_URL}#libyears`}>what libyears measure</OutLink>
      </p>
    </section>
  );
}

function PrioritySection() {
  return (
    <section className="glossary-sect">
      <h3>How a priority is reached</h3>
      <p className="prose">
        The verdict sets a base &mdash; <span className="mono">abandoned</span> and{" "}
        <span className="mono">silent</span> start at critical, <span className="mono">pinned</span>,{" "}
        <span className="mono">left-behind</span> and <span className="mono">old-promise</span> at high,{" "}
        <span className="mono">stale</span> at medium. A package nothing requires directly drops one step, one
        that is only installed for development drops another, and an advisory no release will fix raises it
        one. Low is the floor, critical the ceiling.
      </p>
    </section>
  );
}

/**
 * Opens the dialog as a modal, or, where `showModal()` exists but throws (a sandboxed frame without
 * `allow-modals`, history.md §5), as a plain open dialog that the stylesheet pins over the page
 * (DESIGN.md §5 M28: the legacy fallback rendered below the footer). The fallback gets no native
 * focus handling, so focus is moved in and given back by hand.
 */
function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const [fallback, setFallback] = useState(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null || open === dialog.open) return;
    if (!open) {
      dialog.close();
      if (fallback && opener.current instanceof HTMLElement && opener.current.isConnected)
        opener.current.focus();
      return;
    }
    opener.current = document.activeElement;
    try {
      dialog.showModal();
      setFallback(false);
    } catch {
      dialog.setAttribute("open", "");
      setFallback(true);
    }
    closeRef.current?.focus();
  }, [open, fallback]);

  return { ref, closeRef, fallback };
}

/** The glossary: what every verdict and signal means (legacy `fillLegend` plus report.html's prose). */
export function Glossary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const { ref, closeRef, fallback } = useDialog(open);

  return (
    <dialog
      ref={ref}
      className={fallback ? "glossary is-fallback" : "glossary"}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="glossary-head">
        <h2 id={titleId}>What these words mean</h2>
        <OutLink href={DOCS_URL}>full reference</OutLink>
        <button ref={closeRef} className="icon-btn" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="glossary-body">
        <section className="glossary-sect">
          <h3>The nine verdicts</h3>
          <VerdictDefs />
          <OrderNote />
        </section>
        <section className="glossary-sect">
          <h3>The signals</h3>
          <SignalDefs />
        </section>
        <LibyearsSection />
        <PrioritySection />
      </div>
    </dialog>
  );
}
