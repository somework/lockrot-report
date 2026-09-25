# Changelog

Every release lists what a reader of the page will notice. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A release is numbered after the lockrot
release that first ships it, so the page lockrot 0.12.0 writes is renderer 0.12.0. A release that
stops rendering a document an older release rendered, or that changes the placeholders, the payload
tag or the address format, says so under **Breaking** in its entry.

## [Unreleased]

### Added

- The summary band leads with one answer: how many packages are flagged, out of how many, and what
  share of the lock that is, next to the priority chips and a waffle of one square per package,
  flagged first, at the same square size for a lock of 4 packages or 900. Hovering a priority chip
  lights its squares and its parts of the verdict bars. A clean report says so with a tick; a lock
  with no packages says that instead.
- Under it, three columns: a bar per flagged verdict, most common first, each one a filter and each
  split into the priorities of its packages, in the chips' colours, with the verdicts that are not
  flagged in one quiet line; one square per security advisory, with each package and the version
  its advisories name as the fix; libyears over a bar split into the project's own requirements and
  what they pull in. From 760px up these stay side by side (under 960px the verdicts keep the left
  half, the other two share the right), so a 1024×768 screen still shows the list. On a phone these
  three fold behind one line that counts them, and the lead stays in view.
- The header names the run's gate, "no gate" or "gate: <value>", with a popover saying what that
  means for the run's exit code.
- A Findings row whose package has an age the run measures (how long its branch has been stopped,
  or how long it has gone without a stable release or a push) carries an age scale, when the run
  recorded that age's warn and high thresholds: the two thresholds, and a dot at the package's age.
  One caption above the list names the thresholds, and every row shares one scale.
  An age that did not set the priority (an abandoned or pinned package) draws a neutral dot.
- A definition that names a threshold setting shows what this run set it to, "5 years
  (release-high-years)".
- The package detail says when the search or a filter hides its package from the list, with a
  button to clear them; the search status says so too.
- The glossary's `finished` entry says how to accept a package you consider complete yourself, with
  `extra.lockrot.ignore`.
- The All packages table says, next to a libyears value of exactly `0.0`, why: the installed release
  is the newest lockrot knows of, or it is not behind the newest stable release.

### Changed

- A verdict pill opens its definition in place instead of linking to lockrot.dev, which a report
  opened offline cannot reach; "In the glossary" opens the glossary on that verdict. A pill inside a
  Findings row stays plain text instead, its title still carrying the definition: a click there
  opens the package, the same as clicking anywhere else in the row.
- "Why this is `<priority>`" explains each step of the ladder in a plain sentence instead of a
  code-style chip chain.
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
- "Release branches" in the package detail answers first: which branch you are on and how long ago
  it last released, in the run's age colours, then how many branches are newer and the newest one's
  version, date and php constraint. Below it, one row per branch, newest version first: a line from
  its last release to a "today" rule on one shared axis, its latest version and its php constraint
  as written. Three or more branches older than yours fold into one row, and so do more than four
  between the newest and yours. A dev-branch checkout gets its own row, its age in plain ink rather
  than a release-age colour. Two lines, captioned "3y" and "5y" at the top, mark the run's release
  warn and high years, one dashed and one dotted; one of the two captions says "ago" where the strip
  has room. Every dot sits at its true date, so a release from last week sits on the "today" rule
  and never left of an older one. Your row takes a faint wash of your age colour, while the newest
  branch's line stays neutral whatever its age. The axis labels up to three years; a year next to a
  threshold line moves to one side of its tick instead of disappearing. A package whose branches are
  only its releases shows each release's date where a branch shows its latest version. When a lower
  branch released after the highest one, the sentence calls that one the highest rather than the
  newest.

### Fixed

- The package detail scrolls as one region instead of two nested ones, and opening another package
  starts it at the top.
- The Run tab shows a dash, not "none", for a document that does not record `--fail-on`.
- The priority, verdict and advisory bars stay visible in forced-colours mode.
- Printing keeps the colours of the ledger bars, the pills and a row's priority stripe.
- The timeline's first year is no longer cut off at the left edge.
- A package with no maintained branches no longer shows each version twice on its timeline.
- The timeline's key lists only the markers it draws.
- In dark mode, the timeline's dot for a branch that is neither installed nor the newest no longer
  nearly vanishes.
- A signal's disclosure in the package detail shows its whole focus ring.
- A long repository link in "The lock entry" wraps instead of widening the panel on a phone.
- "Priority of the 1 flagged package" reads in the singular.
- On a wide screen, the end of a long package detail can be scrolled into view; the wheel carries on
  into the page once the panel's own content ends.
- Switching tabs scrolls back to the top, so the new tab starts at its own first row instead of
  wherever the last one happened to be scrolled to.
- On a wide screen, the All packages table and the Blast radius cards use the width a closed detail
  panel leaves behind instead of leaving it empty.
- The advisory ledger no longer says a clean lock has no advisory twice, once above the bar and once
  again in its legend.
- The tab row's own edge shadow, the cue that it scrolls sideways, is visible at a phone width in
  both themes; it used to fade into the background instead of standing out from it.
- The All packages table draws the same edge-shadow cue as the tab row when it scrolls sideways; it
  used to clip a column with nothing on screen saying more of it exists.

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
