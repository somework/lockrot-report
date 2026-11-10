import type { ComponentChildren } from "preact";
import { linkHref, linkState } from "../../state/hash";
import type { LinkTarget } from "../../state/types";
import { useReport } from "../context";
import { isPlainClick } from "../plainClick";

/**
 * A chart mark on Overview: a real link to the fragment it opens, so a reader can copy it or open
 * it in a new tab (PD-OVERVIEW-7). A plain click applies it in place, as a tab switch does: the
 * address is replaced, never pushed (DESIGN.md §4).
 */
export function TabLink({
  target,
  className,
  label,
  children,
}: {
  target: LinkTarget;
  className: string;
  /** The accessible name, when the visible content is a drawing. */
  label?: string;
  children: ComponentChildren;
}) {
  const { dispatch } = useReport();

  return (
    <a
      className={className}
      href={linkHref(target)}
      aria-label={label}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        const next = linkState(target);
        dispatch({
          type: "focus",
          view: next.view,
          filters: next.filters,
          q: next.q,
          ...(next.pkg === null ? {} : { pkg: next.pkg }),
          ...(target.section === undefined ? {} : { section: target.section }),
        });
      }}
    >
      {children}
    </a>
  );
}
