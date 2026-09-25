import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { advisoryCheckIncomplete, allAdvisories } from "../domain/advisories";
import { population } from "../domain/filters";
import { day } from "../domain/format";
import { summaryText } from "../domain/share";
import type { Model } from "../model/types";
import { useReport } from "./context";

/** How long the button reads "Copied" before it goes back to its own name. */
const COPIED_MS = 2000;

/** The copied summary's three lines, from the same counts the summary band draws. */
export function summaryFor(model: Model): string {
  const { run, tool, generatedAt, packagesChecked, findings, libyears } = model.report;
  const advisories = allAdvisories(model);

  return summaryText({
    project: run.project ?? run.lockFile ?? "composer.lock",
    generatedDay: day(generatedAt),
    toolVersion: tool.version,
    targetPhp: run.targetPhp,
    checked: packagesChecked ?? findings.length,
    flagged: population(model, "findings"),
    advisories: advisories.length,
    advisoryPackages: population(model, "advisories").length,
    advisoryCheckIncomplete: advisories.length === 0 && advisoryCheckIncomplete(model),
    libyears,
  });
}

type Status = "idle" | "copied" | "manual";

/**
 * "Copy summary" (Header): the report's answer as three lines of plain text on the clipboard, for a
 * chat or a ticket. Where the Clipboard API is missing or refuses (an older engine, a denied
 * permission), the same text opens in a popover, selected, for the reader to copy themselves —
 * the button never fails silently.
 */
export function CopySummary() {
  const { model } = useReport();
  const text = useMemo(() => summaryFor(model), [model]);
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
