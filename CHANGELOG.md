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
- The Findings list is a ledger: one dense row per package — verdict, package, why it is flagged,
  years since release, how it gets in — under a column head, about a third of a card's height. Beside
  an open package a row takes two lines, the package and how it gets in over the verdict and the
  reason; on a phone three. No value is cut short with an ellipsis at any width: a long name or way
  in wraps, after its vendor's slash first. Each priority group opens with a sentence counting it
  ("2 silent and 1 abandoned; you require all three directly.", or for a mixed group "…; 13 direct,
  25 transitive, 1 dev-only."), and three or more
  consecutive rows that share a verdict and a way in get one above them ("These 14 hoa/* packages are
  all marked abandoned by their repository and were last released 9.1–9.7 years ago. All come in
  through wallabag/rulerz."). Nothing is folded away or reordered; a word the row above already said
  is drawn quieter, the verdict keeping its colour. A count never splits from its word at a hyphen
  ("1 old-promise"). With no package open, a row is one line from 1280px up.
- A row's age is a bar on one axis for the whole list, 0 to 10 years (twice the run's high
  threshold, at least 10), with the warn and high thresholds as guides running down every row and
  captioned once in the column head; an older age runs to the edge with a cut mark and its exact
  years beside it. An age that did not set the priority (an abandoned or pinned package) draws a
  grey bar, keyed in the column head beside the axis as "not flagged for age". A row with no age
  says why: "not flagged for age", or "age not read" when a check could not run. In forced colours
  the track behind a bar is not drawn, so a short bar never looks long.
- Filtering by exactly one signal makes every row quote that signal instead of its own top one.
- An open package starts with one sentence saying what it is and how it gets in, in the release
  branches' serif ("Left behind on 10.x: its last release was 4.5 years ago while 11.x kept
  releasing. It comes in through scheb/2fa-google-authenticator. 2 security advisories affect your
  version and no fix is coming on 10.x."), then its installed version, the age its row draws (in the
  same colour), its libyears and PHP constraint, then how it gets in from composer.json and what
  flagged packages it pulls in — each a flagged package's name opening it. The four facts are always
  there: a missing one says "not recorded" rather than disappearing. The age is always labelled
  "Last release", with whose release it is under it ("on your 10.x", or "on 2.x, newer than yours");
  a branch snapshot says "none, a snapshot" there; a libyears of 0.0 says "nothing newer". The four
  values sit on one line whatever the labels and notes under them, and go two by two when the panel
  itself is too narrow for four. A package that pulls in more flagged packages than fit in a line
  counts them by verdict, worst first as S7 lists them, with "Name all" listing every one of them
  there.
- When a newer branch exists, the release-branches answer names its subject: "Your branch, 1.x, had
  its last release 9.7 years ago.", so it no longer reads as contradicting the package's newest
  release quoted at the top.
- The priority ladder's reach step says "You don't require it directly" and names every requirement
  of yours it comes in through ("It comes through wallabag/rulerz and wallabag/rulerz-bundle."), the
  same ways in the answer sentence and the chain name. Its heading note uses priority words: "one
  rule moved it down from critical", "no rule moved it off high".
- An open package's signals become "Checks", right under the priority ladder: all ten checks in
  two rows of five, each cell its id and a one- or two-word name ("S5 predates PHP"), filled in its
  level's colour when it fired (info in a blue of its own), outlined when it stayed quiet and hatched
  when lockrot says it could not run; then "5 fired · 5 quiet · every check ran", the quiet ones and
  the ones that could not run named in a line each ("Quiet: S5 predates PHP · S6 snapshot"), a line
  breaking only between items, and only the fired checks, high level first. Each opens onto what the
  check looks for, its entry in lockrot's docs and its data: one row per key with the label beside
  its value, keys without underscores, `null` as a dash, a timestamp's date ahead of its quieter
  time, and a list of items one bordered line each instead of JSON. When S10 says a check could not
  run without saying which, the others read "not reported", never quiet.
- A definition that names a threshold setting shows what this run set it to, "5 years
  (release-high-years)".
- The package detail says when the search or a filter hides its package from the list, with a
  button to clear them; the search status says so too.
- The glossary's `finished` entry says how to accept a package you consider complete yourself, with
  `extra.lockrot.ignore`.
- The All packages table says, next to a libyears value of exactly `0.0`, why: the installed release
  is the newest lockrot knows of, or it is not behind the newest stable release.

### Changed

- Clicking a row, or pressing Enter on it, opens its package and never closes it again: a second
  click on the open row used to close the very detail being read. Close and Escape close it.
- A verdict pill opens its definition in place instead of linking to lockrot.dev, which a report
  opened offline cannot reach; "In the glossary" opens the glossary on that verdict. A pill inside a
  Findings row stays plain text instead, its title still carrying the definition: a click there
  opens the package, the same as clicking anywhere else in the row.
- "Why this is `<priority>`" is a ladder: the verdict's starting priority, then each rule — reach,
  dev, an advisory with no fix — in the order lockrot applies them, including the ones that did not
  apply ("You require it directly: no step down."), each a dot on a critical · high · medium · low
  track, ending "So: <priority>".
- The detail header puts the installed version beside the name and the pills and links on one line;
  the direct/transitive and require-dev tags and the replacement link moved into the answer
  sentence, and "How it is reached" is no longer a folded section.
- A Findings row shows one signal, its most serious, said short; the package's detail lists the
  rest (the row no longer counts them), and a printed row shows them all.
- The package detail leads with its answer and the priority ladder, then "Follow the upstream";
  "The lock entry" and "Provenance" start folded.
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
