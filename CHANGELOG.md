# Changelog

Every release lists what a reader of the page will notice. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A release is numbered after the lockrot
release that first ships it, so the page lockrot 0.12.0 writes is renderer 0.12.0. A release that
stops rendering a document an older release rendered, or that changes the placeholders, the payload
tag or the address format, says so under **Breaking** in its entry.

## [Unreleased]

### Added

- A line above the ledger counts the flagged packages by priority. On a phone it is the folded
  summary itself, over a small copy of the priority bar.
- The header names the run's gate, "no gate" or "gate: <value>", with a popover saying what that
  means for the run's exit code.
- A Findings row whose package has an S8, S2 or S4 age carries an age scale: the run's warn and high thresholds, and a dot at the
  package's age. One caption above the list names the thresholds, and every row shares one scale.
  An age that did not set the priority (an abandoned or pinned package) draws a neutral dot.
- A definition that names a threshold setting shows what this run set it to, "5 years
  (release-high-years)".
- The package detail says when the search or a filter hides its package from the list, with a
  button to clear them; the search status says so too.
- The glossary's `finished` entry says how to accept a package you consider complete yourself, with
  `extra.lockrot.ignore`.

### Changed

- A verdict pill, a Findings row's included, opens its definition in place instead of linking to
  lockrot.dev, which a report opened offline cannot reach. "In the glossary" opens the glossary on
  that verdict.
- A Findings row shows one signal, its most serious, and how many more there are; a printed row
  shows them all.
- The package detail leads with "Follow the upstream"; "How it is reached", "The lock entry" and
  "Provenance" start folded.
- The search hint is one line, "Press ? for keys and search syntax"; the keys and the search syntax
  are in the glossary.
- The glossary opens on the nine verdicts, the other sections folded, and its reference link names
  where it goes.
- Escape closes an open popover first, and only the popover.
- Ledger legend entries look like the filter buttons they are, and their title says what a click
  does.
- Every fold on the page has the same disclosure marker, with a hover and focus state.
- The advisory ledger no longer says no advisory affects the lock when the report shows the check
  may not have covered every package; it says how many could not be confirmed clear.

### Fixed

- The package detail scrolls as one region instead of two nested ones, and opening another package
  starts it at the top.
- The Run tab shows a dash, not "none", for a document that does not record `--fail-on`.
- The priority, verdict and advisory bars stay visible in forced-colours mode.
- Printing keeps the colours of the ledger bars, the pills and a row's priority stripe.
- A release-branch label no longer starts under its dot on a narrow timeline, and one that wraps no
  longer pulls the dot down between its lines.
- The timeline's first year is no longer cut off at the left edge.
- A package with no maintained branches no longer shows each version twice on its timeline.
- The timeline's legend lists only the states a branch is in.
- In dark mode, the timeline's dot for a branch that is neither installed nor the newest no longer
  nearly vanishes.
- A signal's disclosure in the package detail shows its whole focus ring.
- A long repository link in "The lock entry" wraps instead of widening the panel on a phone.
- "Priority of the 1 flagged package" reads in the singular.
- On a wide screen, the end of a long package detail can be scrolled into view; the wheel carries on
  into the page once the panel's own content ends.

## [0.12.0]

The page lockrot 0.12.0 writes with `--format=html`.

### Changed

- The page ships its stylesheet without comments, 10 KB lighter; the comments stay in the source.
  Two bugs came from them reaching the page: one spelled out the body tag, so the page carried a
  second `<body>`, and one quoted JSX braces that read like a placeholder. The build now fails on
  any comment that reaches `dist/`, and on any `{{…}}` other than the three placeholders.

### Fixed

- A release-branch label in the timeline is no longer cut short. It grows toward the side with
  more room, and one too long for either side wraps, keeping `php` next to its constraint; the
  lane grows to hold it. A branch plotted mid-axis used to end in "… · p…".

## [0.11.0]

The page lockrot 0.11.0 writes with `--format=html`, rewritten out of lockrot's repository: same
document, same address format, same keys.

### Added

- A `lockrot-provenance` class the page styles, for a publisher's line above a republished report;
  the page's policy refuses inline styles, so this is how such a line gets its look.

### Changed

- The page runs under a Content-Security-Policy that pins its one script and one stylesheet by
  hash, and allows no connection of any kind.
- On a phone the findings come first: the summary and the filters fold above the list, and the
  package opens as a full-screen sheet.
- Severity is read case-insensitively, and GitHub's `moderate` counts as medium.
- S10 has a name and a glossary entry, and sorts after S9.
- Numbers read in the singular when there is one of them.

### Fixed

- A malformed escape in the address no longer blanks the page, and an unknown tab opens Findings.
- A link pasted into an open page applies.
- The theme button always offers the other theme, including the first time under a dark OS setting.
- Enter on a link inside a row follows the link.
- `j`/`k` walk the rows on screen, on every tab, and do nothing behind the glossary.
- Rows of the All packages table can be focused and show which one is open.
- An unknown package in the address says so instead of locking the page's scroll on a phone.
- A clean report says nothing was flagged, not that nothing matches a filter.
- Healthy packages no longer count as "Already accepted".
- A blast-radius card's count is the rows it lists.
- The timeline no longer drops its first year, and a label no longer pairs one tag's version with
  another tag's date.
- Ledger filter buttons expose their pressed state to assistive technology.
