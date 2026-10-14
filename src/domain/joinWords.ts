/** `a`, `a and b`, `a, b and c`: the list shape of lockrot's sentences. */
export function joinAnd(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}
