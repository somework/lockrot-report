import type { RefObject } from "preact";
import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  annotateThresholds,
  CONFIG_DOCS_URL,
  DOCS_URL,
  SIGNAL_DEFS,
  SIGNAL_DOC,
  SIGNAL_NAMES,
  signalDef,
  TONE,
  VERDICT_DEFS,
} from "../domain/vocab";
import { unknownSignalIds } from "../domain/filters";
import { SIGNAL_IDS, VERDICTS } from "../model/types";
import { OutLink, toneClass } from "./common/common";
import { useReport } from "./context";

/** `data-term` and `tabIndex={-1}` let "In the glossary" give focus to the term it named
 *  (PD-GLOSSARY-7), outside the Tab order. */
function VerdictDefs() {
  const { model } = useReport();
  const thresholds = model.report.run.thresholds;

  return (
    <dl className="deflist">
      {VERDICTS.map((verdict) => {
        const count = model.report.counts[verdict] ?? 0;
        return [
          <dt
            key={`t-${verdict}`}
            data-term={verdict}
            tabIndex={-1}
            className={`term-toned ${toneClass(TONE(verdict))}`}
          >
            {verdict}
            {count > 0 && <span className="muted"> {count}</span>}
          </dt>,
          // A definition naming a run's config key shows this run's value beside it
          // (PD-GLOSSARY-8).
          <dd key={`d-${verdict}`}>{annotateThresholds(VERDICT_DEFS[verdict] ?? "", thresholds)}</dd>,
        ];
      })}
    </dl>
  );
}

/** S1 to S10 in numeric order, then each id this page has no name for, as written, never in a known
 *  check's words. */
function SignalDefs() {
  const { model } = useReport();
  const thresholds = model.report.run.thresholds;
  const unknown = unknownSignalIds(model.report.findings);

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
          // PD-GLOSSARY-8: S2 and S4 each name their own warn/high pair the same way.
          <dd key={`d-${id}`}>{annotateThresholds(SIGNAL_DEFS[id] ?? "", thresholds)}</dd>,
        ];
      })}
      {unknown.map((id) => [
        <dt key={`t-${id}`}>
          <code>{id}</code>
        </dt>,
        <dd key={`d-${id}`}>{signalDef(id)}</dd>,
      ])}
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

/** Content only — the title now lives in the enclosing `<details>`'s `<summary>` (PD-GLOSSARY-2). */
function LibyearsSection() {
  return (
    <p className="prose">
      For each package, the years between the release installed and the package's newest dated release,
      summed. It counts every drift, healthy patches included, so it says how far behind the lock is and
      nothing about why &mdash; it is not a verdict, and no priority reads it. A package is not measured when
      it is a branch snapshot, when no dated release is known for it, when it is not from a Composer
      repository, or when its metadata did not come; the Run tab counts each case.{" "}
      <OutLink href={`${DOCS_URL}#libyears`}>what libyears measure</OutLink>
    </p>
  );
}

/** Accepting a finished package is a step for whoever maintains the lock, so it has its own last
 *  fold (PD-GLOSSARY-9/10). */
function AcceptSection() {
  return (
    <p className="prose glossary-note">
      A package you consider finished can be accepted the same way the built-in allowlist accepts one:{" "}
      <span className="mono">extra.lockrot.ignore</span> in <span className="mono">composer.json</span>, with
      a reason. It then reads <span className="mono">finished</span> here and is never a finding.{" "}
      <OutLink href={`${CONFIG_DOCS_URL}#the-allowlist`}>How to configure it (lockrot.dev)</OutLink>
    </p>
  );
}

/** Content only — see `LibyearsSection`. */
function PrioritySection() {
  return (
    <p className="prose">
      The verdict sets a base &mdash; <span className="mono">abandoned</span> and{" "}
      <span className="mono">silent</span> start at critical, <span className="mono">pinned</span>,{" "}
      <span className="mono">left-behind</span> and <span className="mono">old-promise</span> at high,{" "}
      <span className="mono">stale</span> at medium. A package nothing requires directly drops one step, one
      that is only installed for development drops another, and an advisory no release will fix raises it one.
      Low is the floor, critical the ceiling.
    </p>
  );
}

/** The keys and search grammar, beside the rest of the reference rather than under every list
 *  (PD-GLOSSARY-2). */
function KeysSection() {
  return (
    <>
      <p className="prose">
        <kbd>/</kbd> to search · <kbd>j</kbd> <kbd>k</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd>{" "}
        to close · <kbd>?</kbd> for this glossary.
      </p>
      <p className="prose">
        On a narrower screen a package opens over the page: <kbd>j</kbd> <kbd>k</kbd> still move,{" "}
        <kbd>Esc</kbd> goes back to its row, and <kbd>/</kbd> closes it for the search box.
      </p>
      <p className="prose">
        Search keys: <code>verdict:</code> <code>priority:</code> <code>signal:</code> <code>severity:</code>{" "}
        <code>cve:</code> <code>direct:</code> <code>dev:</code>
      </p>
      <p className="prose">
        The tab, the filters and the open package are in the address, so the address bar is a link to what you
        are looking at.
      </p>
    </>
  );
}

/**
 * Where `showModal()` throws (a sandboxed frame without `allow-modals`), a plain open dialog pinned
 * over the page, with focus moved by hand. `opener` is read on close in both paths: a DocsPill's
 * popover moves focus to <body> before this effect runs, so the native restore would land there.
 */
function useDialog(open: boolean, opener?: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const [fallback, setFallback] = useState(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null || open === dialog.open) return;
    if (!open) {
      dialog.close();
      if (restoreTo.current instanceof HTMLElement && restoreTo.current.isConnected)
        restoreTo.current.focus();
      return;
    }
    const override = opener?.current ?? null;
    if (opener) opener.current = null; // consumed: never leaks into a later, differently-triggered open
    restoreTo.current = override ?? document.activeElement;
    try {
      dialog.showModal();
      setFallback(false);
    } catch {
      dialog.setAttribute("open", "");
      setFallback(true);
    }
    closeRef.current?.focus();
  }, [open, fallback, opener]);

  return { ref, closeRef, fallback };
}

/** Matches `glossary-highlight-fade`'s duration in app.css. */
const HIGHLIGHT_MS = 1600;

/** Compared attribute by attribute: a report's string may carry a character `querySelector` would
 *  choke on. */
function findTerm(dialog: HTMLDialogElement, term: string): HTMLElement | null {
  for (const dt of dialog.querySelectorAll<HTMLElement>("dt[data-term]")) {
    if (dt.getAttribute("data-term") === term) return dt;
  }
  return null;
}

/**
 * Scrolls the asked-for entry into view, marks it and focuses its term (PD-GLOSSARY-7). Runs after
 * `useDialog`'s effect, so this focus wins over the Close button; scroll behaviour and the fade
 * follow the reader's reduced-motion preference through CSS.
 */
function useHighlightTerm(
  dialogRef: RefObject<HTMLDialogElement | null>,
  open: boolean,
  term: string | null | undefined,
) {
  useLayoutEffect(() => {
    if (!open || !term) return undefined;
    const dialog = dialogRef.current;
    const dt = dialog ? findTerm(dialog, term) : null;
    if (dt === null) return undefined;
    const dd = dt.nextElementSibling instanceof HTMLElement ? dt.nextElementSibling : null;

    dt.classList.add("glossary-highlight");
    dd?.classList.add("glossary-highlight");
    dt.scrollIntoView({ block: "center" });
    dt.focus({ preventScroll: true });

    const timer = window.setTimeout(() => {
      dt.classList.remove("glossary-highlight");
      dd?.classList.remove("glossary-highlight");
    }, HIGHLIGHT_MS);

    return () => {
      window.clearTimeout(timer);
      dt.classList.remove("glossary-highlight");
      dd?.classList.remove("glossary-highlight");
    };
  }, [dialogRef, open, term]);
}

/** The glossary: what every verdict and signal means (legacy `fillLegend` plus report.html's prose). */
export function Glossary({
  open,
  onClose,
  opener,
  highlightTerm,
}: {
  open: boolean;
  onClose: () => void;
  opener?: RefObject<HTMLElement | null>;
  /** Set only when a verdict pill's "In the glossary" opened it. */
  highlightTerm?: string | null;
}) {
  const titleId = useId();
  const { ref, closeRef, fallback } = useDialog(open, opener);
  useHighlightTerm(ref, open, highlightTerm);

  return (
    <dialog
      ref={ref}
      className={fallback ? "glossary is-fallback" : "glossary"}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="glossary-head">
        <h2 id={titleId}>What these words mean</h2>
        {/* Names the destination (PD-GLOSSARY-3); the anchor is mkdocs' slug of verdicts.md's
           top heading. */}
        <OutLink href={`${DOCS_URL}#verdicts-and-priority`}>How lockrot decides (lockrot.dev)</OutLink>
        <button ref={closeRef} className="icon-btn" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="glossary-body">
        {/* The verdicts stay in view; every other section folds (PD-GLOSSARY-2). */}
        <section className="glossary-sect">
          <h3>The nine verdicts</h3>
          <VerdictDefs />
          <OrderNote />
        </section>
        {/* The heading sits inside <summary> so a reader moving by heading still finds it. */}
        <details className="glossary-sect">
          <summary>
            <h3>The signals</h3>
          </summary>
          <SignalDefs />
        </details>
        {/* Open: the summary band and All packages lead with libyears (PD-GLOSSARY-10). */}
        <details className="glossary-sect" open>
          <summary>
            <h3>One number for the lock: libyears</h3>
          </summary>
          <LibyearsSection />
        </details>
        <details className="glossary-sect">
          <summary>
            <h3>How a priority is reached</h3>
          </summary>
          <PrioritySection />
        </details>
        <details className="glossary-sect">
          <summary>
            <h3>Keys and search</h3>
          </summary>
          <KeysSection />
        </details>
        <details className="glossary-sect">
          <summary>
            <h3>For the lock's maintainers: accepting a package</h3>
          </summary>
          <AcceptSection />
        </details>
      </div>
    </dialog>
  );
}
