/**
 * The `composer require` line a finding suggests, or the clipboard guard that decides when none
 * should be offered at all.
 *
 * Ported verbatim from legacy `lib.js` (lib.md §3). This is the entire security boundary for a
 * value that ends up on the clipboard and, from there, quite possibly in a shell: what a
 * "copy to clipboard" button copies is the raw, unescaped string, and there is no escaping left
 * between the clipboard and wherever the user pastes it.
 */

/**
 * The `composer require` line for a package name and constraint, or `null` when either half is not
 * the shape it has to be. Ported verbatim from legacy `installCommand()` (`lib.js:58-64`).
 *
 * Three gates hold this safe together, and weakening any one of them reopens a clipboard-to-shell
 * injection:
 * - `name` must be Composer's `vendor/name` shape — no injection characters are possible in a value
 *   already that constrained.
 * - `constraint` must match Composer's real constraint grammar, which legitimately contains shell
 *   metacharacters (`<`, `>`, `|`, `*`, spaces — e.g. `>=10.0 <12.0`, `~2.0|^3.0`) but explicitly
 *   excludes the characters that would let it smuggle a *second* shell command: backtick, `$`,
 *   `;`/`&&`, `#`, and any newline.
 * - the constraint is then wrapped in single quotes — safe specifically because the allowed
 *   character set contains no `'`, so nothing in a valid constraint can close the quote early.
 */
export function installCommand(name: unknown, constraint: unknown): string | null {
  const vendorName = String(name);
  if (!/^[A-Za-z0-9]([A-Za-z0-9._-]*)\/[A-Za-z0-9]([A-Za-z0-9._-]*)$/.test(vendorName)) return null;

  const value = String(constraint);
  if (value.length > 100 || !/^[A-Za-z0-9.,^~><=!|*/ @_-]+$/.test(value)) return null;

  return `composer require ${vendorName} '${value}'`;
}
