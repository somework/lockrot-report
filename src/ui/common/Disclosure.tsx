import type { ComponentChildren } from "preact";
import { useReport } from "../context";
import { usePrinted } from "../print/printContext";
import "./disclosure.css";

/** Level 1 of a block (PD-GATE-4): kept in `state.disclosure`, so it survives a re-render; always
 *  open on paper, where the button has nothing to do. */
export function useDisclosure(key: string): { open: boolean; toggle: () => void; printed: boolean } {
  const { state, dispatch } = useReport();
  const printed = usePrinted();
  const open = printed || state.disclosure[key] === true;
  return {
    open,
    printed,
    toggle: () => {
      dispatch({ type: "disclose", key, open: !open });
    },
  };
}

/** `lead`: the marker opens the label, as a summary's does, where the label is the sentence's subject.
 *  `name`: a fuller accessible name, which must contain the visible label. */
export function DisclosureButton({
  label,
  name,
  open,
  controls,
  onToggle,
  lead = false,
  className,
  id,
  describedBy,
}: {
  label: ComponentChildren;
  name?: string | undefined;
  open: boolean;
  controls: string;
  onToggle: () => void;
  lead?: boolean;
  className?: string;
  id?: string;
  /** What tells this button apart from others with its name, such as the text it follows. */
  describedBy?: string | undefined;
}) {
  const mark = <span className="l1-mark" aria-hidden="true" />;
  return (
    <button
      type="button"
      id={id}
      className={className === undefined ? "l1-btn" : `l1-btn ${className}`}
      aria-label={name}
      aria-describedby={describedBy}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      {lead && mark}
      {label}
      {!lead && mark}
    </button>
  );
}

/** `labelledBy`: the button's id, so the opened panel is named by what opened it. */
export function DisclosurePanel({
  id,
  open,
  className,
  labelledBy,
  children,
}: {
  id: string;
  open: boolean;
  className?: string;
  labelledBy?: string | undefined;
  children: ComponentChildren;
}) {
  return (
    <div
      id={id}
      className={className === undefined ? "l1-panel" : `l1-panel ${className}`}
      hidden={!open}
      role={labelledBy === undefined ? undefined : "group"}
      aria-labelledby={labelledBy}
    >
      {children}
    </div>
  );
}
