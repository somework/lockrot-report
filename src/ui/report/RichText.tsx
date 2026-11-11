import type { ComponentChildren } from "preact";
import type { JumpTarget, Rich } from "../../domain/rich";
import { serializeHash } from "../../state/hash";
import { OutLink } from "../common/common";
import { useReport } from "../context";
import { isPlainClick } from "../plainClick";
import { jumpInDetail } from "./jumpInDetail";

/** Scrolls to an element of the sheet. The page keeps its state in the URL fragment, so a jump
 *  never sets the fragment: `#id` would drop the open package. */
function jumpTo(event: MouseEvent, id: string): void {
  event.preventDefault();
  // A frame later, so a group the click opens has drawn the row it lands on.
  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (target === null) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    jumpInDetail(target);
    target.focus({ preventScroll: true });
  });
}

/** A jump to `to` inside the sheet. Its href is the page's own address, the open package included,
 *  because `#id` opens no package and its useId value differs on the next load. */
export function JumpLink({
  to,
  className = "lnk",
  label,
  onJump,
  children,
}: {
  to: string;
  className?: string;
  label?: string;
  /** Opens what hides the target, before the jump. */
  onJump?: () => void;
  children: ComponentChildren;
}) {
  const { state } = useReport();
  return (
    <a
      className={className}
      href={"#" + serializeHash(state)}
      data-jump={to}
      aria-label={label}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        onJump?.();
        jumpTo(event, to);
      }}
    >
      {children}
    </a>
  );
}

/** The ids the sheet's in-page jumps land on; a target the sheet does not draw prints as text. */
export type JumpIds = Readonly<Partial<Record<JumpTarget, string>>>;

/** A phrase of the sheet as text nodes, its code spans, links and jumps drawn as markup. */
export function RichText({ rich, jumps = {} }: { rich: Rich; jumps?: JumpIds }) {
  return (
    <>
      {rich.map((piece, i) => {
        if (typeof piece === "string") return piece;
        if ("code" in piece) return <code key={i}>{piece.code}</code>;
        if ("strong" in piece) return <strong key={i}>{piece.strong}</strong>;
        if ("href" in piece) {
          return (
            <OutLink key={i} href={piece.href} label={piece.name}>
              {piece.text}
            </OutLink>
          );
        }
        const target = jumps[piece.jump];
        if (target === undefined) return (piece.lead ?? "") + piece.text;
        const link = (
          <JumpLink key={i} to={target} className={piece.lead === undefined ? "lnk d3-count-link" : "lnk"}>
            {piece.text}
          </JumpLink>
        );
        return piece.lead === undefined ? (
          link
        ) : (
          <span key={i} className="d3-jump">
            {piece.lead}
            {link}
          </span>
        );
      })}
    </>
  );
}
