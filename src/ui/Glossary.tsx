import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { DOCS_URL } from "../domain/vocab";
import { OutLink } from "./common/common";
import { GlossaryBody2 } from "./report/Glossary";

/**
 * Where `showModal()` throws (a sandboxed frame without `allow-modals`), a plain open dialog pinned
 * over the page, with focus moved by hand. Focus goes back to what held it when the dialog opened.
 */
function useDialog(open: boolean) {
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
    restoreTo.current = document.activeElement;
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
        {/* Names the destination (PD-GLOSSARY-3); the anchor is mkdocs' slug of verdicts.md's
           top heading. */}
        <OutLink href={`${DOCS_URL}#verdicts-and-priority`}>How lockrot decides (lockrot.dev)</OutLink>
        <button ref={closeRef} className="icon-btn" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <GlossaryBody2 onClose={onClose} />
    </dialog>
  );
}
