const MANY_ALTERNATIVES = 4;

/** A php constraint as written, or `{first} … {last} ({n} alternatives)` once it has more than four. */
export function phpConstraintWord(constraint: string): string {
  const alternatives = constraint.split(/\s*\|\|?\s*/);
  return alternatives.length > MANY_ALTERNATIVES
    ? `${alternatives[0] ?? ""} … ${alternatives.at(-1) ?? ""} (${alternatives.length} alternatives)`
    : constraint;
}
