import type { JumpTarget, Rich } from "../../domain/rich";
import { OutLink } from "../common/common";

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
          <a key={i} className={piece.lead === undefined ? "lnk d3-count-link" : "lnk"} href={`#${target}`}>
            {piece.text}
          </a>
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
