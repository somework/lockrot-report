import type { HeldBy } from "../model/report";
import type { Rich } from "./rich";

/** A hold's link words (SPEC §7.9.21), with the target it names, and " in require-dev" on a root hold
 *  of that section. A link the page does not know reads as a requirement. */
export function linkWords(hold: HeldBy): Rich {
  const words = baseLinkWords(hold);
  return hold.source === "root" && hold.link === "require-dev" ? [...words, " in require-dev"] : words;
}

function baseLinkWords({ link, target, constraint, package: holder, version }: HeldBy): Rich {
  // Ruling R9: self.version means the holder's own version, so the page names it.
  const named = (verb: string): Rich => [
    verb,
    ...(target === null ? [] : [`${target} `]),
    { code: constraint },
    ...(constraint === "self.version" && version !== null ? [` (${version})`] : []),
  ];
  switch (link) {
    case "conflict":
      return named("conflicts with ");
    case "replace":
      return target === null ? [`replaced by ${holder ?? ""}`] : named("replaces ");
    case "root-require":
      return target === null ? ["no release of ", { code: constraint }, " can install"] : named("requires ");
    default:
      return named("requires ");
  }
}
