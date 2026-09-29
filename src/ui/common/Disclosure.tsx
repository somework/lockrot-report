import type { ComponentChildren } from "preact";
import { useReport } from "../context";
import { usePrinted } from "../print/printContext";
import "./disclosure.css";

/**
 * Level 1 of a block (round 2, DESIGN.md §5 PD-GATE-4): an inline text button that opens a panel
 * under the sentence it ends. Kept in `state.disclosure`, so it survives a re-render; always open
 * on paper, where the button has nothing to do.
 */
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

/** `lead`: the marker opens the label, as a summary's does, where the label is the sentence's subject. */
export function DisclosureButton({
  label,
  open,
  controls,
  onToggle,
  lead = false,
  className,
}: {
  label: ComponentChildren;
  open: boolean;
  controls: string;
  onToggle: () => void;
  lead?: boolean;
  className?: string;
}) {
  const mark = <span className="l1-mark" aria-hidden="true" />;
  return (
    <button
      type="button"
      className={className === undefined ? "l1-btn" : `l1-btn ${className}`}
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

export function DisclosurePanel({
  id,
  open,
  className,
  children,
}: {
  id: string;
  open: boolean;
  className?: string;
  children: ComponentChildren;
}) {
  return (
    <div id={id} className={className === undefined ? "l1-panel" : `l1-panel ${className}`} hidden={!open}>
      {children}
    </div>
  );
}
