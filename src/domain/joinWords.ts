/** `a`, `a and b`, `a, b and c`: the list shape of lockrot's sentences, for items of any type. */
export function listParts<T>(items: readonly T[]): (T | string)[] {
  return items.flatMap((item, i) => [...(i === 0 ? [] : [i === items.length - 1 ? " and " : ", "]), item]);
}

export const joinAnd = (items: readonly string[]): string => listParts(items).join("");
