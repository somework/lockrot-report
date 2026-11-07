import { useEffect, useRef, useState } from "preact/hooks";

export type CopyStatus = "idle" | "copied" | "manual";

export interface CopyTimes {
  readonly copiedMs: number;
  readonly manualMs: number;
}

export interface Copy {
  readonly status: CopyStatus;
  /** Writes `text` to the clipboard. A missing clipboard or a refusal ends in `manual`, after
   *  `onManual` has put the text where the reader can select it. */
  readonly copy: (text: string, onManual: () => void) => void;
  readonly reset: () => void;
}

/** One copy control's outcome: each attempt ends in exactly one status, which its own live region
 *  announces and a timer clears. */
export function useCopy({ copiedMs, manualMs }: CopyTimes): Copy {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const pending = useRef<number | undefined>(undefined);
  // Each copy and reset starts a new attempt, so a clipboard answer to an earlier one is dropped.
  const attempt = useRef(0);

  useEffect(() => {
    if (status === "idle") return undefined;
    const timer = window.setTimeout(
      () => {
        setStatus("idle");
      },
      status === "copied" ? copiedMs : manualMs,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [status, copiedMs, manualMs]);

  useEffect(
    () => () => {
      window.clearTimeout(pending.current);
    },
    [],
  );

  // A later task than the reset, so the live region is empty in between and a repeated outcome is
  // announced again.
  const settle = (outcome: CopyStatus, onManual?: () => void): void => {
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      setStatus(outcome);
      onManual?.();
    }, 0);
  };

  const copy = (text: string, onManual: () => void): void => {
    setStatus("idle");
    const mine = ++attempt.current;
    const clipboard = (navigator as { clipboard?: Clipboard }).clipboard;
    if (clipboard === undefined) {
      settle("manual", onManual);
      return;
    }
    clipboard.writeText(text).then(
      () => {
        if (mine === attempt.current) settle("copied");
      },
      () => {
        if (mine === attempt.current) settle("manual", onManual);
      },
    );
  };

  const reset = (): void => {
    attempt.current++;
    window.clearTimeout(pending.current);
    setStatus("idle");
  };

  return { status, copy, reset };
}
