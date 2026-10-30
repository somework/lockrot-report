import { useId, useMemo, useRef } from "preact/hooks";
import { copySummary } from "../domain/copySummary";
import { useCopy, type CopyStatus } from "./common/useCopy";
import { useReport } from "./context";

const TIMES = { copiedMs: 2000, manualMs: 2600 } as const;

const ANNOUNCED: Readonly<Record<CopyStatus, string>> = {
  idle: "",
  copied: "Summary copied to the clipboard",
  manual: "The clipboard is not available. The summary is selected: press Ctrl+C or Command+C to copy it.",
};

/**
 * "Copy summary" (Header): the report's answer as three lines of plain text on the clipboard, for a
 * chat or a ticket. Where the Clipboard API is missing or refuses (an older engine, a denied
 * permission), the same text opens in a popover, selected and focused, for the reader to copy
 * themselves, and the live region says so.
 */
export function CopySummary() {
  const { model } = useReport();
  const text = useMemo(() => copySummary(model.report).join("\n"), [model]);
  const { status, copy } = useCopy(TIMES);
  const popover = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const popoverId = `${useId()}-copy`;

  const showManual = (): void => {
    const pop = popover.current;
    if (pop !== null && typeof pop.showPopover === "function" && !pop.matches(":popover-open"))
      pop.showPopover();
    area.current?.focus();
    area.current?.select();
  };

  return (
    <>
      <button
        className="icon-btn copy-summary"
        type="button"
        title="Copy a three-line summary of this report as plain text"
        onClick={() => {
          copy(text, showManual);
        }}
      >
        {status === "copied" ? "Copied" : "Copy summary"}
      </button>
      {/* A live region, not role="status": the search count line is the page's one status. */}
      <span className="copy-status" aria-live="polite">
        {ANNOUNCED[status]}
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
