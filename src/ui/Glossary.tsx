import type { RefObject } from "preact";
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

/** Content only — the title now lives in the enclosing `<details>`'s `<summary>` (PD-GLOSSARY-2). */
function LibyearsSection() {
  return (
    <p className="prose">
      For each package, the years between the release installed and the package's newest stable release,
      summed. It counts every drift, healthy patches included, so it says how far behind the lock is and
      nothing about why &mdash; it is not a verdict, and no priority reads it. A package is not measured when
      it is a branch snapshot, when no dated stable release is known for it, when it is not from a Composer
      repository, or when its metadata did not come; the Run tab counts each case.{" "}
      <OutLink href={`${DOCS_URL}#libyears`}>what libyears measure</OutLink>
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

/**
 * PD-GLOSSARY-2: what the search hint used to carry on every filterable tab (SearchBar.tsx), moved
 * here so it lives beside the rest of the reference instead of repeating itself under every list.
 * The keys and the search grammar are the legacy page's own vocabulary, unchanged; only where a
 * reader finds them moved. Content only — see `LibyearsSection`.
 */
function KeysSection() {
  return (
    <>
      <p className="prose">
        <kbd>/</kbd> to search · <kbd>j</kbd> <kbd>k</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd>{" "}
        to close · <kbd>?</kbd> for this glossary.
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
 * Opens the dialog as a modal, or, where `showModal()` exists but throws (a sandboxed frame without
 * `allow-modals`, history.md §5), as a plain open dialog that the stylesheet pins over the page
 * (DESIGN.md §5 M28: the legacy fallback rendered below the footer). The fallback gets no native
 * focus handling, so focus is moved in and given back by hand.
 *
 * `opener` overrides what focus returns to, when the caller passed one (`context.ts#openGlossaryFrom`).
 * Reading `document.activeElement` fresh, here, is a step too late for a DocsPill's "In the glossary"
 * button: it hides its own popover (`popovertargetaction="hide"`) as part of the same click, which
 * moves focus to `<body>` before this effect ever runs, so the browser's own focus-on-close (and, for
 * the fallback path, the explicit `.focus()` below) would land on `<body>` instead of the pill (a11y
 * review). `opener.current` is read explicitly on close, in both the modal and the fallback path,
 * rather than left to `dialog.close()`'s own restore: that native behaviour uses whatever it captured
 * when `showModal()` ran, which is exactly the stale value this override exists to correct.
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

/** The glossary: what every verdict and signal means (legacy `fillLegend` plus report.html's prose). */
export function Glossary({
  open,
  onClose,
  opener,
}: {
  open: boolean;
  onClose: () => void;
  /** Who to return focus to on close, overriding a freshly-read `document.activeElement`
   *  (`context.ts#openGlossaryFrom`). */
  opener?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const { ref, closeRef, fallback } = useDialog(open, opener);

  return (
    <dialog
      ref={ref}
      className={fallback ? "glossary is-fallback" : "glossary"}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="glossary-head">
        <h2 id={titleId}>What these words mean</h2>
        {/* PD-GLOSSARY-3: the old link's text ("full reference") named nothing; a reader could not
            tell it left the page at all, let alone for where. This names the destination and the
            anchor points at the doc's own top-level heading (`# Verdicts and priority` in
            lockrot/docs/verdicts.md), which mkdocs slugs to "verdicts-and-priority" the same way it
            slugs the section anchors this page already links (`#the-nine-verdicts`, `#libyears`). */}
        <OutLink href={`${DOCS_URL}#verdicts-and-priority`}>How lockrot decides (lockrot.dev)</OutLink>
        <button ref={closeRef} className="icon-btn" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="glossary-body">
        {/* PD-GLOSSARY-2: the nine verdicts are what a reader opening the glossary almost always
            wants first, so they stay in view; the signals, priority, libyears and keys sections
            each fold behind their own <summary> instead of arriving as one long scroll (Anatoly:
            "'What these words mean' opens a pile of text"). */}
        <section className="glossary-sect">
          <h3>The nine verdicts</h3>
          <VerdictDefs />
          <OrderNote />
        </section>
        {/* a11y review: a bare <summary> dropped the section's own heading, so a screen-reader
            reader moving by heading found only one (the section headings elsewhere are <h3>). A
            <summary> accepts one heading as content, so the text moves into an <h3> — the layout
            (the flex row, the chevron) stays on the <summary> itself, restyled to the same look in
            app.css's `.glossary-sect > summary h3`. */}
        <details className="glossary-sect">
          <summary>
            <h3>The signals</h3>
          </summary>
          <SignalDefs />
        </details>
        <details className="glossary-sect">
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
      </div>
    </dialog>
  );
}
