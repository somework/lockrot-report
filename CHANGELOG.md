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

### Changed

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
