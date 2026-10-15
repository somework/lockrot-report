import type { ComponentChildren } from "preact";
import { safeHref } from "../../domain/links";
import type { Tone } from "../../domain/vocab";
import "./common.css";

/**
 * The small pieces every surface uses. Tone is a class, never an inline style: the page runs under
 * a CSP that pins its one stylesheet by hash, and a `style="…"` attribute in markup would be refused
 * (DESIGN.md §1.3). The tone classes are defined once, in styles/base.css.
 */

export function toneClass(tone: Tone): string {
  return `tone-${tone}`;
}

/** A filter toggle's tooltip: what the click does, not the visible label again. Shared by every
 *  chip and by the summary band's bars, which are toggles of the same filters. */
export function filterTitle(label: string, pressed: boolean): string {
  return pressed ? `Showing only ${label} — click to clear this filter` : `Show only ${label}`;
}

/**
 * A ledger legend entry: the tally beside its swatch, and a filter toggle for that bucket at once
 * (verdict, priority or advisory severity) — shared by `VerdictLedger`, `PriorityLedger` and
 * `AdvisoryLedger` so the three chips look, hover and focus alike (PD-LEDGER-2, DESIGN.md §5: a
 * plain-text look gave no hint that clicking one did anything). `title` names the click's effect
 * rather than repeating the visible label, since the label is already on the button.
 */
export function LegendButton({
  tone,
  dim = false,
  pressed,
  label,
  count,
  onToggle,
}: {
  tone: Tone;
  /** A bucket with nothing, or nothing flagged, in it: full-contrast text, a faded swatch
   *  (`legend-btn-dim` in ledger.css). */
  dim?: boolean;
  pressed: boolean;
  label: string;
  count: number;
  onToggle: () => void;
}) {
  const classes = ["legend-btn", toneClass(tone), dim && "legend-btn-dim"];

  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(" ")}
      aria-pressed={pressed}
      title={filterTitle(label, pressed)}
      onClick={onToggle}
    >
      <i className="swatch" aria-hidden="true" />
      {label} <i className="count">{count}</i>
    </button>
  );
}

/**
 * A link that leaves the page. The URL is checked again here whatever produced it: a document is
 * data, and the one place a value becomes an `href` is where a `javascript:` URL has to stop. When
 * the check fails the text is still shown, unlinked.
 */
export function OutLink({
  href,
  children,
  tabIndex,
  title,
}: {
  href: string | null;
  children: ComponentChildren;
  /** -1 inside a list row that is not the list's Tab stop (PD-ROWS-11, `ui/rowCursor.ts`). */
  tabIndex?: -1 | undefined;
  title?: string;
}) {
  const safe = safeHref(href);
  if (safe === null) return <span className="out">{children}</span>;

  return (
    <a
      className="out"
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={tabIndex}
      title={title}
    >
      {children}
    </a>
  );
}
