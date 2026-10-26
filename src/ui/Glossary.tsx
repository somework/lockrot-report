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
    // Close sits in the sticky head, always in view: a focus scroll would undo the opening scroll in WebKit.
    closeRef.current?.focus({ preventScroll: true });
  }, [open, fallback]);

  return { ref, closeRef, fallback };
}

/** Where the dialog opens: at its top, or at the "Keys and search" section. */
export type GlossaryAt = "top" | "keys";

interface GlossaryProps {
  open: boolean;
  at?: GlossaryAt;
  onClose: () => void;
}

/** The glossary: what every verdict and signal means (legacy `fillLegend` plus report.html's prose). */
export function Glossary({ open, at = "top", onClose }: GlossaryProps) {
  const titleId = useId();
  const { ref, closeRef, fallback } = useDialog(open);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || dialog === null) return;
    const keys = dialog.querySelector(".glossary-keys");
    // An opening jump, not the smooth scroll of the CSS, which headless WebKit never runs.
    if (at === "keys" && typeof keys?.scrollIntoView === "function")
      keys.scrollIntoView({ block: "start", behavior: "instant" });
    else dialog.scrollTo({ top: 0, behavior: "instant" });
  }, [open, at, ref]);

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
      <GlossaryBody2 onClose={onClose} keysOpen={at === "keys"} />
    </dialog>
  );
}
