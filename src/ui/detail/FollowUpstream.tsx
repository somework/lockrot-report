import { useEffect, useRef, useState } from "preact/hooks";
import type { Finding } from "../../model/types";
import { installCommand } from "../../domain/install";
import "./detail.css";

type CopyLabel = "Copy" | "Copied" | "Select it and copy";

/** How long the label stays changed before it reverts to "Copy" — ported verbatim from legacy's
 *  1400/2600ms (`report.js:977`, js-4.md §4): roughly double on failure, to give time to read it. */
const COPIED_MS = 1400;
const FAILED_MS = 2600;

/**
 * The "Copy" button, ported from legacy's `[data-copy]` click handler (`report.js:972-985`). The
 * label lives in this component's own state instead of a DOM node's `textContent` — critic.md M34's
 * fix: legacy's `setTimeout` wrote back to a button that a re-render could have already thrown away.
 * Keying the label to state means a re-render naturally shows the current state's label, and the
 * pending timer is cleared on unmount so it never fires against a gone component.
 */
function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState<CopyLabel>("Copy");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  function revertAfter(ms: number): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLabel("Copy");
    }, ms);
  }

  function handleClick(): void {
    // Feature-detect only, exactly as legacy did (js-4.md §4) — no Permissions API check, no
    // execCommand fallback. `navigator.clipboard` itself can be absent (an insecure context, an
    // older browser, this project's own test environment) even though the ambient DOM types call
    // it always present; the cast keeps that real possibility visible instead of the type checker
    // "proving" the guard below unreachable.
    const clipboard = (navigator as { clipboard?: Clipboard }).clipboard;
    if (!clipboard) {
      setLabel("Select it and copy");
      revertAfter(FAILED_MS);
      return;
    }
    clipboard.writeText(text).then(
      () => {
        setLabel("Copied");
        revertAfter(COPIED_MS);
      },
      () => {
        setLabel("Select it and copy");
        revertAfter(FAILED_MS);
      },
    );
  }

  return (
    <button type="button" className="detail-copy" onClick={handleClick}>
      {label}
    </button>
  );
}

/**
 * "Follow the upstream": the S8 suggested-constraint command box, ported from legacy's `action`
 * block (`report.js:832-836,748`). Exists only when the finding's S8 signal carries a
 * `suggested_constraint` that `installCommand` accepts — the clipboard-safety gate is entirely
 * `installCommand`'s (`domain/install.ts`), not repeated here. The command text is a plain, always
 * visible and selectable sibling of the Copy button (js-4.md §4), never something the button reaches
 * into and selects itself.
 */
export function FollowUpstream({ finding }: { finding: Finding }) {
  const s8 = finding.signals.find((signal) => signal.id === "S8");
  // Legacy gated on the suggestion's own truthiness before ever calling `installCommand`
  // (`report.js:747`: `var suggestion = s8 && s8.data && s8.data.suggested_constraint;`), not merely
  // on what `installCommand` accepts — `installCommand(pkg, undefined)` would otherwise pass, since
  // `String(undefined)` ("undefined") happens to satisfy the constraint grammar it checks.
  const suggestion = s8?.data.suggested_constraint;
  const command = suggestion ? installCommand(finding.package, suggestion) : null;
  if (command === null) return null;

  return (
    <div className="detail-action">
      <span className="detail-action-eyebrow">Follow the upstream</span>
      <div className="detail-cmd">
        <span className="detail-cmd-text">{command}</span>
        <CopyButton text={command} />
      </div>
    </div>
  );
}
