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
- The gate fact's popover no longer states `--fail-on`'s exit-code semantics or recommends setting
  it in CI — both beyond what the page can derive from the document — and instead states only what
  the run was given.
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
