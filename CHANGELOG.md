# Changelog

Every release lists what a reader of the page will notice. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A release is numbered after the lockrot
release that first ships it, so the page lockrot 0.12.0 writes is renderer 0.12.0. A release that
stops rendering a document an older release rendered, or that changes the placeholders, the payload
tag or the address format, says so under **Breaking** in its entry.

## [Unreleased]

### Added

- A one-line priority count above the ledger, "N critical · N high · N medium · N low of N
  packages". On a phone it is the folded summary's own line, readable without unfolding anything.
- A quiet gate fact beside the lockrot version in the header, "no gate" or "gate: <value>", with a
  popover saying what the run's `--fail-on` does and does not mean.
- A verdict pill's definition opens in a popover in place, a Findings row's pill included, instead
  of linking to lockrot.dev, which a report opened offline could never reach. The popover also
  opens the full glossary.
- A small age scale beside a Findings row's key fact: a track, a tick at the run's warn and high
  thresholds, and a dot at the finding's own age, coloured by zone. Shown whenever the finding
  carries an S8, S2 or S4 signal and the run recorded both matching thresholds.
- A verdict or signal definition that names one of the run's own config keys
  (`release-warn-years`, `push-high-years`, …) now shows what this run set it to beside the name,
  "5 years (release-high-years)". The key name itself is unchanged, only led by the value.
- The package detail's header names it when the current search term or a rail filter is hiding the
  open package from its own tab's list, with a control to clear them. The package still stays open;
  only the reader is told why the list underneath it looks empty.
- The glossary's `finished` entry names how a reader accepts a package they consider complete
  themselves, `extra.lockrot.ignore` in `composer.json` with a reason, linked to lockrot.dev's
  configuration docs — the same mechanism the built-in allowlist already uses.
- A small caption above the Findings list, "age scale: warn 3 y high 5 y" (a CSS-drawn tick between
  each pair, not a text glyph), naming the run's own age thresholds once for the whole list instead
  of only in each row's own hover title; its accessible name spells the unit out in full, "age
  scale: warn at 3 years, high at 5 years".
- The phone fold's own priority-counts `<summary>` carries a small, non-interactive echo of the
  ledger's own priority bar, so a phone reader sees a shape before unfolding anything, not only
  words.

### Changed

- The advisory ledger no longer reads "No advisory affects this lock" when the report's own data
  says the check may not have covered every package (a network failure, or a note naming the
  advisory or audit check): it says "No advisory found; N packages could not be confirmed clear"
  in a neutral tone instead of the green all-clear. Unchanged when the check ran cleanly.

- A Findings row leads with one key-fact line — its highest-level signal — instead of up to three,
  plus a muted "+N more signals, open the package" when there are more.

- The package detail leads with the follow-the-upstream action, when there is one. "How it is
  reached", "The lock entry" and "Provenance" are folded by default, each opened from its heading.
- The search hint under the box is one line, "Press ? for keys and search syntax"; the shortcut
  keys, search keys and address-bar note it used to spell out are in the glossary's new "Keys and
  search" section.
- The glossary opens with only "The nine verdicts" in view; the signals, libyears, priority and keys
  sections fold behind their own heading.
- The glossary's "full reference" link names its destination: "How lockrot decides (lockrot.dev)".
- Escape closes an open popover first, and only the popover, before the glossary or the detail.
- A ledger legend entry reads as a control — a chip with its own hover, focus and pressed look —
  instead of plain distribution text, and its title names what clicking it does.
- Every Findings row's age scale now shares one maximum with the whole list, computed from the
  oldest row shown, instead of each row rescaling its own track — a dot's position along the track
  now means the same thing on every row.
- Every `<details>`/`<summary>` on the page — the ledger and rail phone folds, the glossary's own
  sections, the detail panel's reference and signal disclosures — now draws the same disclosure
  marker (a CSS triangle, not a text glyph), with its own hover and focus state.

### Fixed

- The package detail no longer has two nested scrolling regions, and opening a different package
  starts it at the top instead of where the previous package was scrolled to.
- The Run tab's fail-on row reads an em dash for a document written before `run.fail_on` existed,
  instead of the word "none".
- Closing the glossary after opening it from a verdict pill's "In the glossary" button returns focus
  to the pill, instead of leaving it on the glossary's own (now closed) Close button.
- The signals, libyears, priority and keys sections of the glossary, and the package detail's three
  reference sections, keep their own heading (inside the `<summary>` that folds them) instead of a
  bare, headingless disclosure line.
- The gate fact's popover explains what the run's gate actually does instead of only restating the
  value it was given: "no gate" says the run exits 0 regardless of findings and names the flag to
  pass in CI to change that; a named gate says the run exits 1 once an unaccepted finding reaches
  it, and that the page does not record whether that happened.
- The gate fact's popover, at 320px, no longer runs its left edge to the screen edge.
- The priority, verdict and advisory bars stay legible in forced-colours mode; the segments used to
  disappear into the page background.
- Printing a Findings, Packages or Blast page keeps the gate fact's label (just not its ⓘ icon or
  popover), instead of losing "no gate"/"gate: `<value>`" entirely — the Run tab that also carries it
  is a different view, not printed alongside whichever one was open.
- The phone fold's priority-counts line no longer splits a count from its label, or the label from
  its own leading dot, when it wraps at 320px; the fold's disclosure marker stays pinned to the
  row's top corner instead of drifting to whichever line the wrap happens to end on.
- A release branch's timeline label no longer starts under the dot's glow ring on a narrow track;
  the gap now has a fixed floor sized to the dot's own footprint, not just a share of the track.
- A ledger bar segment, a legend swatch, a verdict or priority pill, a row's own priority stripe and
  the tone-coloured text beside them (a priority-group heading, the summary band's counts) now opt
  out of Chromium's ink-saving print default (`print-color-adjust: exact`), the same way the age
  scale's tick and dot already did, instead of printing as whatever colour that default leaves them.
- "In the glossary", from a verdict pill's popover, now opens the glossary scrolled to and focused
  on that verdict's own entry — marked with a brief highlight — instead of at the top of the list.
- The release-branch timeline's first year tick no longer loses part of itself off the axis's left
  edge (as little as "24" for "2024" at 1440px, gone entirely at 390px).
- A branch label that wraps to a second line no longer pulls its dot down between both lines; the
  dot stays pinned to the line it marks.
- A package with no maintained branches — every release its own "branch", named after that same
  tag — no longer shows its version twice, once bare and once with a "v" prefix.
- The timeline's legend shows "branch still releasing" and "you are on <version>" only when a lane
  actually carries that state, instead of unconditionally.
- The timeline's dots for a branch that is neither installed nor the newest keep enough contrast
  against the panel in dark mode; they used to nearly vanish.
- The Findings row's age scale and a ledger legend chip's pressed state stay legible in
  forced-colours mode; the scale's track, ticks and dot, and the chip's pressed look and swatch,
  used to disappear into the page background the same way the ledger bars once did.
- The age scale's warn..high dot no longer breaks into unreadable fragments in forced-colours mode
  at normal display density, and no longer paints over a threshold tick that sits at nearly the
  same position on the track — a value close to a threshold used to erase that tick outright.
- A pressed ledger legend chip's own label stays visible in forced-colours mode; the native button
  could paint a light system colour behind it even while its text stayed a light system colour too,
  a light-on-light label the chip's own computed style never showed as wrong.
- The detail's "Clear filters" control moves keyboard focus to the panel's own Close button instead
  of dropping it to the page as a whole, which it used to do by unmounting itself on the same click.
- The search status line also names the open package once a search term or a rail filter hides it,
  so a reader typing in the search box hears it, not only sees it in the detail's own note.
- Printing a Findings row now keeps every signal it carries, not just the one key-fact line — print
  has no detail pane to open, so the "+N more signals, open the package" note is dropped there too.
- A verdict pill's popover dims the page behind it and sits nearer the top of the viewport, instead
  of a fixed, undimmed card that could land squarely on the row it was opened from on a short page.
- At 1440px, the side-column detail panel's own bottom (the Provenance section) could render off
  the bottom of the viewport with no way to reach it: wheeling over the panel no longer stops dead
  once it can scroll no further internally, but chains into the page, which carries the panel into
  its sticky position where it fits.
- A Findings row's age scale no longer contradicts the verdict beside it: a finding whose priority
  does not come from age (`abandoned`, `pinned`) still draws its scale for context, but the dot is
  now a fixed neutral tone instead of the zone's own colour, and its label says so — before this, an
  abandoned package (CRITICAL from its own repository flag) whose age happened to sit in the warn
  zone drew the same olive dot as a package actually flagged for its age.
- `<details>`/`<summary>` disclosure markers no longer depend on a font glyph for "▸", which one
  review environment rendered as a near-invisible 3-4px dot instead of a triangle; the marker is now
  drawn from a CSS border, and stays a clean triangle (rather than a filled square) in forced-colours
  mode too.
- The age scale's two threshold ticks now carry a `title`, matching their accessible name, so
  hovering them shows a reader what they mean instead of nothing at all.
- The age scale's own accessible name no longer includes the once-per-list legend's tick glyph
  (`▏`, which a screen reader read aloud as "left one-eighth block") or the short "y" unit; the
  legend's accessible name now reads "age scale: warn at N years, high at N years" in full, and the
  tick itself is a CSS-drawn bar with real spacing on both sides instead of a character that sat
  flush against the word beside it.
- A Findings row's age scale ticks stay visible when a dot lands on or near one — PD-ROWS-3's shared
  maximum bunches every row's ticks at a fixed spot, and a dot painted over whichever tick shared its
  position; the ticks now paint above the dot, with a small gap in the row's own background colour,
  in the default colour scheme as well as forced-colours.
- The phone fold's own priority-bar echo (`SummaryPriorityBar`) is a `<span>`, not a `<div>`: the
  fold renders it directly inside a `<summary>`, which only allows phrasing content.
- A package detail signal's summary keeps a visible keyboard-focus ring on every side; the panel's
  own `overflow: hidden` (kept for its rounded corners) used to clip three of the ring's four sides,
  leaving only a thin bar on the left.
- The package detail's "The lock entry" no longer runs its repository link past the panel's own edge
  at 320-390px; the link now wraps like the rest of that row's value instead of forcing the whole
  panel to scroll sideways.
- The priority ledger's eyebrow reads "Priority of the 1 flagged package" for exactly one flagged
  package, instead of always the plural "packages".
- At 1440px, the side-column detail panel's own sticky header no longer renders partially behind the
  page's fixed header once a wheel gesture has carried the panel into its stuck position on a report
  short enough that the row around it ends before the panel's own travel does; the row now reserves
  enough space for the panel's whole stuck range whenever the panel is actually tall enough to need
  it.

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
