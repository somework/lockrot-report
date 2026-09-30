import type { ComponentChildren } from "preact";
import "./fix-unchecked.css";

/** "fix not checked": no release was read (S9 `releases_read: false`), so this is not an answer the
 *  way "no fix listed" is; its own words and its italic say so, with no hover needed. */
export function Unchecked({ children }: { children: ComponentChildren }) {
  return <span className="fix-unchecked">{children}</span>;
}
