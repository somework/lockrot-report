/** Whether a Composer `php` constraint admits a PHP version (SPEC §7.9.19, "needs PHP"). It reads the
 *  forms of a `php` requirement: `||` or `|` alternatives of space- or comma-joined parts, each a
 *  caret, tilde, wildcard, comparison or exact version. Null when it cannot read the constraint. */

type Version = readonly [number, number, number];

function parse(text: string): Version | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(text);
  if (match === null) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function partAdmits(part: string, version: Version): boolean | null {
  if (part === "*") return true;
  const wildcard = /^v?(\d+)(?:\.(\d+))?\.\*$/.exec(part);
  if (wildcard !== null)
    return (
      version[0] === Number(wildcard[1]) && (wildcard[2] === undefined || version[1] === Number(wildcard[2]))
    );
  const range = /^([\^~])(v?\d+(?:\.\d+){0,2})$/.exec(part);
  if (range !== null) {
    const low = parse(range[2] ?? "");
    if (low === null) return null;
    const parts = (range[2] ?? "").split(".").length;
    const high: Version =
      range[1] === "~"
        ? parts === 3
          ? [low[0], low[1] + 1, 0]
          : [low[0] + 1, 0, 0]
        : low[0] > 0
          ? [low[0] + 1, 0, 0]
          : low[1] > 0
            ? [0, low[1] + 1, 0]
            : [0, 0, low[2] + 1];
    return compare(version, low) >= 0 && compare(version, high) < 0;
  }
  const comparison = /^(>=|<=|>|<|==|=|!=)?(v?\d+(?:\.\d+){0,2})$/.exec(part);
  const bound = comparison === null ? null : parse(comparison[2] ?? "");
  if (comparison === null || bound === null) return null;
  const order = compare(version, bound);
  switch (comparison[1]) {
    case ">=":
      return order >= 0;
    case "<=":
      return order <= 0;
    case ">":
      return order > 0;
    case "<":
      return order < 0;
    case "!=":
      return order !== 0;
    default:
      return order === 0;
  }
}

export function phpAdmits(constraint: string, version: string): boolean | null {
  const at = parse(version);
  if (at === null) return null;
  const answers = constraint
    .trim()
    .split(/\s*\|\|?\s*/)
    .map((alternative) => {
      const parts = alternative
        .replace(/(>=|<=|!=|==|>|<|=)\s+/g, "$1")
        .split(/[\s,]+/)
        .filter((part) => part !== "")
        .map((part) => partAdmits(part, at));
      if (parts.length === 0 || parts.includes(null)) return null;
      return parts.every((answer) => answer === true);
    });
  if (answers.includes(true)) return true;
  return answers.includes(null) ? null : false;
}
