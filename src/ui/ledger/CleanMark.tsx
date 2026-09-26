/**
 * A tick in a ring: the band's one "all clear" mark — a clean report's lead, and a lock no advisory
 * affects. Drawn inline, in `currentColor`, so nothing is fetched (DESIGN.md §1) and it takes
 * whatever tone its line is in; `aria-hidden`, since the sentence beside it says the same.
 */
export function CleanMark({ size }: { size: number }) {
  return (
    <svg className="clean-mark" width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="15" cy="15" r="13.5" fill="none" stroke="currentColor" stroke-width="2" />
      <path
        d="M9 15.5l4 4 8-8.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
