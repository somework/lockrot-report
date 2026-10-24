import type { HeldBy } from "../model/report";
import type { Rich } from "./rich";

/** A hold's link words (SPEC §7.9.21), with the target it names. A link the page does not know reads
 *  as a requirement. */
export function linkWords({ link, target, constraint, package: holder }: HeldBy): Rich {
  const named = (verb: string): Rich => [
    verb,
    ...(target === null ? [] : [`${target} `]),
    { code: constraint },
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
