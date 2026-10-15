import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { copySummary } from "../domain/copySummary";
import { useReport } from "./context";

/** How long the button reads "Copied" before it goes back to its own name. */
const COPIED_MS = 2000;

type Status = "idle" | "copied" | "manual";

/**
 * "Copy summary" (Header): the report's answer as three lines of plain text on the clipboard, for a
 * chat or a ticket. Where the Clipboard API is missing or refuses (an older engine, a denied
 * permission), the same text opens in a popover, selected, for the reader to copy themselves —
 * the button never fails silently.
 */
export function CopySummary() {
  const { model } = useReport();
  const text = useMemo(() => copySummary(model.report).join("\n"), [model]);
  const [status, setStatus] = useState<Status>("idle");
  const popover = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const popoverId = `${useId()}-copy`;

  useEffect(() => {
    if (status !== "copied") return undefined;
    const timer = window.setTimeout(() => {
      setStatus("idle");
    }, COPIED_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);

  const showManual = (): void => {
    setStatus("manual");
    const pop = popover.current;
    if (pop !== null && typeof pop.showPopover === "function") {
      if (!pop.matches(":popover-open")) pop.showPopover();
      area.current?.focus();
      area.current?.select();
    }
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      showManual();
    }
  };

  return (
    <>
      <button
        className="icon-btn copy-summary"
        type="button"
        title="Copy a three-line summary of this report as plain text"
        onClick={() => {
          void copy();
        }}
      >
        {status === "copied" ? "Copied" : "Copy summary"}
      </button>
      {/* A live region, not role="status": the search count line is the page's one status. */}
      <span className="copy-status" aria-live="polite">
        {status === "copied" ? "Summary copied to the clipboard" : ""}
      </span>
      <div id={popoverId} ref={popover} popover="auto" className="fact-pop copy-pop">
        <label className="copy-pop-label" htmlFor={`${popoverId}-text`}>
          The clipboard is not available here. Select and copy these three lines:
        </label>
        <textarea
          id={`${popoverId}-text`}
          ref={area}
          className="copy-pop-text"
          readOnly
          rows={4}
          value={text}
        />
      </div>
    </>
  );
}
