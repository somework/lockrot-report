/**
 * The Libyears panel of the Overview as text (SPEC §7.9.6): the total over the packages measured,
 * and the package furthest behind. `null` when no package could be measured.
 */

import type { Report2 } from "../model/report";
import { decimal, plural } from "./format";

const AT_LEAST = "at least ";

export function libyearsPanel({ libyears }: Pick<Report2, "libyears">): string | null {
  if (libyears.total === null) return null;
  const bound = libyears.at_least_count > 0 ? AT_LEAST : "";
  const total = `${bound}${decimal(libyears.total, 2)} libyears over ${plural(libyears.measured, "package", "packages")}`;
  const worst = libyears.furthest_behind;
  if (worst === null) return total;
  const behind = `${worst.at_least ? AT_LEAST : ""}${decimal(worst.libyears, 2)}`;
  return `${total} · furthest behind: ${worst.package} ${worst.version}, ${behind}`;
}
