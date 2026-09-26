# Changelog

Every release lists what a reader of the page will notice. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A release is numbered after the lockrot
release that first ships it, so the page lockrot 0.12.0 writes is renderer 0.12.0. A release that
stops rendering a document an older release rendered, or that changes the placeholders, the payload
tag or the address format, says so under **Breaking** in its entry.

## [Unreleased]

### Added

- All packages on a phone: under 480px the rows stack — name and version, then the verdict, the
  libyears bar and how it gets in, with the priority as the row's left rule — instead of a table
  cut after its second column. The list opens with how many of the listed packages are behind their
  newest stable release, how many are not, and how many could not be measured.
- All packages on a tablet, or beside an open package: under 1000px of list the rows stack two
  lines each — name and version, then verdict, priority, the libyears bar, the ten signal dots and
  how it gets in — instead of a table scrolled past its fourth column; the column heads become a
  row of sort chips. The eight-column table now fits from 1280px, Data as of included.
- All packages draws libyears as bars on one scale captioned in the column head, a zero as a muted
  dash and an unmeasured value as a "?", each explained once in a key above the table; the signals
  column is ten dots per row under a 1…10 caption, filled in the level's tone where a signal fired.
- An active-filters line under the count: every rail filter, ledger chip and the search as a chip
  that removes only itself.
- A package named in a sentence — the open package's answer and priority ladder, Blast radius's
  sentences, S7's table — opens that package when the lock lists it.

- Run data opens with the run in one sentence: which lockrot, how many packages of which lock,
  against which PHP, whether require-dev was in, when (UTC), whether every lookup answered, how old
  the cached repository activity was, and the gate. The thresholds are drawn on the same 3y/5y
  scale as the Findings column, and the fields sit in three groups: told, reached, measured.
- A document that leaves out fields this page reads (an older lockrot's `abandoned` or `libyears`,
  `run.fail_on`) gets a note naming them, and each empty value says why ("not in this document"
  when the key is absent, "left empty by this run" when it is null, or what the file shows, such as
  "none — all 69 repository answers in this file were fetched during the run") instead of an em dash.
- In an open package, a check cell with something to show is a button: a fired check opens its row,
  a check that could not run opens S10, a quiet archived or push-age check opens the repository
  activity. Provenance lists that activity (forge, repository, archived, last push, fetched fresh
  or from the cache) as one compact line under the package metadata.
- Provenance never ends on a dash: a package with no metadata or activity says why (not from a
  Composer repository, not in this document, S10 stopped the check, none recorded), and a document
  without per-package facts shows the forge, repository and last push a fired S3/S4 carries,
  marked as read from that check. A quiet S4 cell now moves focus onto the activity line itself.
- A quiet archived or push-age check on a package this file holds no repository activity for (one
  not from a Composer repository, say) is drawn dashed, counted in the tally ("8 quiet (2 with no
  activity on file)"), named on its own line with the reason and a "See Provenance" link, and its
  cell opens Provenance, which says the same from its side. Before, "every check ran" and a quiet
  S4 sat above "none — not from a Composer repository" with nothing tying the two together.
- Run data values in parts ("yes · no count recorded · 2 notes above") no longer leave a dot hanging
  at a line's end, and on a phone they take the full width under their label so no part wraps
  inside itself. "2 notes above" moves to the notes. Provenance's facts lines drop the dot at a
  wrap the same way, give ages in words as the fired checks above them do ("8.2 years ago"), label
  every activity line "Repository activity" with its forge or host as the document writes it, and
  no longer date package metadata the file does not hold. Subjects sharing one threshold scale are
  bracketed together and the scale's words say "both".

- The Advisories tab answers first: how many advisories on which packages, by severity, how many
  sit on packages installed for production, how many are fixed on the branch you are on, only on
  another branch or not at all, and how long ago they were reported. Under a filter it says
  "matching" and gives the unfiltered count.
- Each advisory is one ledger row: severity, title, its CVE (or "no CVE assigned") and id, the
  package with how it gets in and a prod or dev mark, the range it affects, the release that fixes
  it and whether that release is on your branch, and a bar for how long ago it was reported on one
  shared scale. Rows stay grouped by what the fix takes, most severe first.
- Findings and All packages rows with advisories carry the same chip: a square per advisory in its
  severity's colour and the count; hovering it counts them by severity and quotes each fix.
- When the run says its advisory check may not have covered every package (network failures, or a
  note on the check), the Advisories tab says so right under its answer, with a link to Run data,
  instead of only when nothing was found. Each advisory row's accessible name now carries its
  severity and CVE or id, so two advisories on one package no longer sound the same.
- Advisory ages under 45 days read in days or weeks ("2 weeks ago", "6 wk") rather than "1 mo".
  The reported-ago axis now also shows beside an open package, at laptop widths and on paper; group
  sentences wrap back to the left edge; on a phone the range and the fix sit together at the foot
  of each row; the answer says "by severity" to keep it apart from the summary band's priorities;
  a repeated package reads quieter; the empty tab no longer shows "0 of 0 advisories".
- A count of advisories from a check the run says was incomplete now says so everywhere it
  appears: a "Check incomplete" tag in the summary band (the same tag the empty and the non-empty
  Advisories tab use), a ring beside the Advisories tab's count, "6 advisories, check incomplete"
  in the phone fold's line, and "(advisory check incomplete, so the list may be partial)" in the
  text "Copy summary" puts on the clipboard.
- When advisories sit on both production and dev-only packages, the Advisories answer counts each
  side by severity ("4 in production (1 critical, 1 high, 1 medium and 1 low) and 2 dev-only (…)").
  The reported-ago axis names the unit its ticks are in ("Reported, months ago" over 0 · 6 mo ·
  12 mo), a repeated package on the next row keeps its full name, only quieter, and a package
  named in an answer or group sentence wraps only at its slash, never at a hyphen.

- A run compared against a baseline says so in the summary band, straight under the flagged
  count and in view on a phone: how many findings are new, how many got worse and how many the
  baseline already accepts, each count a filter of the list (the rail's "Since" filter), and which
  baseline entries are for packages no longer in the lock. A worsened row reads "worsened from
  stale" (the verdict the baseline accepted), and a package's detail opens with its standing
  against the baseline, drawn as the accepted verdict → the verdict now. Run data shows the
  baseline as four numbers, with the entries gone from the lock by name; each of the first three
  lists its findings on Findings in one press. New and worsened wear the page's accent colour
  everywhere, so red and orange keep meaning critical and high; the rail names the baseline file
  whole, in its own case.
- Beside the header's gate fact, a count of the findings at or above the run's `--fail-on` level
  and, with a baseline, how many "of them" it does not already accept; that second count lists
  exactly those findings on Findings in one press, from any tab. The page still does not say
  whether the run passed, and an accepted package's detail names `--fail-on`'s counting rule, not
  a build outcome.

- "Print / PDF" in the header prints the whole report as one document, whatever tab is open: the
  summary band, Findings with every signal, Advisories in full, the ranked rows of Blast radius and
  the run's facts, in numbered sections; All packages is added when you print from that tab, and the
  print says which. Filters and search on screen do not narrow it. Every page after the first
  repeats the project, the data date and the lockrot version, and pages are numbered, in browsers
  that support page-margin boxes. The browser's own Print does the same.
- A printed report wastes less paper and reads on every page: each Findings priority group repeats
  its name, its sentence and the years-since-release scale at the top of every page it runs onto,
  and a page breaks between packages, never inside one. No section starts a page of its own any
  more, a heading always keeps its first rows, and an empty lock prints on one page. The printed All
  packages table repeats its column names on every page, gives a data date every package shares
  once instead of in a column, and marks a zero libyears "newest". Package names print as names,
  without the screen's "opens its detail".
- The printed Blast radius repeats its key and its years-since-release scale at the top of every
  page its ranked rows run onto, never splits a row, and keeps what follows the ranking with its
  last row instead of leaving it alone above Run data. On paper the Findings scale gives its 0, 3y
  and 5y room of their own and keys a grey bar inside the scale, not beside "Reached"; the All
  packages table prints without a box, and a section's opening sentence is never split.
- "Copy summary" puts three plain lines on the clipboard: the run, the flagged count by priority,
  and where the flagged packages sit with the advisories and libyears. Where the clipboard is not
  available the same text opens selected, to copy by hand.
- Under the summary figure, one line splits the flagged packages by where they are installed and
  how they get in: "51 in production, 18 dev-only · 20 required directly, 49 pulled in".
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
  two rows of five, each cell its id and a one- or two-word name ("S5 predates PHP", a quiet S10 "all
  checks ran"), never split inside a word even on a 320px phone, filled in its level's colour when it
  fired (info in a blue of its own; in forced colours high solid, warn ringed, info half-filled),
  outlined when it stayed quiet and hatched when lockrot says it could not run; then "5 fired · 5
  quiet · every check ran", the quiet ones and the ones that could not run listed by id in a line
  each ("Quiet: S5 · S6", the names read out to a screen reader), a line never starting on a "·",
  and only the fired checks, high level first. Each opens onto what the check looks for, its entry
  in lockrot's docs and its data: one row per key with the label beside its value, keys without
  underscores, `null` as a dash, a timestamp's date ahead of its quieter time, and each object in a
  list (an S7 package, an S9 advisory) a bordered block with one field a line, labels aligned
  across the list, its name first, a dependency chain joined with "›". A package name, URL, date,
  verdict or advisory id wraps only after a "/", never at its own hyphens. When S10 says a check
  could not run without saying which, the others read "not reported", never quiet.
- A definition that names a threshold setting shows what this run set it to, "5 years
  (release-high-years)".
- The package detail says when the search or a filter hides its package from the list, with a
  button to clear them; the search status says so too.
- The glossary's `finished` entry says how to accept a package you consider complete yourself, with
  `extra.lockrot.ignore`.
- The All packages table says, next to a libyears value of exactly `0.0`, why: the installed release
  is the newest lockrot knows of, or it is not behind the newest stable release.
- A search says where it matched when that is not only the package name: the status line splits
  the count, `16 match “hoa/”: 14 by name, 2 mention it (wallabag/rulerz, wallabag/rulerz-bundle)`,
  naming up to three packages that only mention the word, and each such row on Findings, All
  packages and Advisories quotes its evidence around the hit, "matched in: pulls in 14 flagged
  packages: hoa/compiler (abandoned)…". What a search matches, and its `q=` address, are unchanged.
- Blast radius is a ranked ledger. It opens with one sentence, "wallabag/rulerz (14) and
  phpunit/phpunit (13) pull in 27 of the 49 flagged packages that sit under 17 of the 29 direct
  requirements lockrot's exposure list names", then gives each direct requirement a row: its rank, its version, "dev", "<verdict>
  itself" when it is flagged too, a square per flagged package listed under it (the same square size
  on every row, coloured by priority as in the summary band), a sentence on what it pulls in ("14
  abandoned — all hoa/*"), and those packages' years since release on the Findings axis ("Their
  years since release"; a dash where no age signal fired, so no words sit across the guides). A hollow
  ring with "+N" counts what the row also reaches that is listed under another row, and "listed
  under X" jumps to that row, opens it and marks those packages. A row's toggle shows its packages
  as a chain tree with their verdict, reason and age; a click on the row opens the requirement's
  full detail, the same one Findings opens. Rows that pull in one package each fold under one line
  (open on a wide screen, closed on a phone). After the ranking come the requirements that are
  flagged themselves with nothing listed under them (under a head of their own, "Its own years since
  release", since their ages are the requirement's own; a dash, not "0", where the squares go), and
  those that reach flagged packages only through rows above, listed by the package they reach. A
  footnote names flagged direct requirements that lockrot's exposure list leaves out, each name
  opening its detail. Print opens every row and fold.
- Under a search or a rail filter, Blast radius says its counts are of the flagged packages that
  match ("…with matching flagged packages under it: 14"), gives the counts without the filter on
  the line below, and a row whose packages the filter hides says how many ("None of the 14 flagged
  packages listed under it match the filter.") instead of "Nothing flagged is listed under it". With
  no row left to rank, the "flagged themselves" tail opens as the list, headed "12 direct
  requirements match the filter themselves (…); nothing listed under them does", and a row there
  whose name lacks the searched words quotes the evidence they were found in. The count line counts
  every direct requirement the tab names, the "only through rows above" tail too, and when the
  exposure list leaves flagged direct requirements out it says so: "29 of 29 direct requirements on
  the exposure list, plus 8 of 8 flagged ones it leaves out".

### Changed

- Rail counts follow the other filters and the search: each is what the list shows with that row
  on — a click on a second signal lists the union, and its count says so — and a row matching
  nothing the other filters leave is hidden unless it is on. Signal names in the rail are short
  enough to stay on one line; the full definition is still the button's tooltip.
- Sorting All packages by Libyears starts with the package furthest behind; the unmeasured and
  zero rows no longer come first.
- The count line no longer repeats "2 filters on" beside the chips that name them; a screen reader
  still hears it.
- The glossary opens with its libyears section unfolded; how to accept a package yourself moved out
  of the "finished" definition into its own last section, for the lock's maintainers.
- Run data draws threshold pairs that share both numbers on one scale; the abandoned-replacement
  count says how many more name a successor only in words (the package panel now says "in words
  only" for those); "network failures: yes" says lockrot records no count and points at the notes;
  a value such as the cache date and its age wraps between its parts, never inside one, and the
  `--fail-on` flag in the sentence never breaks at a hyphen. In forced colours the warn and high
  threshold bands differ by pattern (single hatch, cross-hatch), not only by colour.

- With no advisory at all, the Advisories tab says "No advisory affects this lock", or, when the
  run's notes say the check may not have run, "No advisory found; N packages could not be confirmed
  clear" with a link to Run data, instead of "Nothing was flagged". The group hints that advised
  ("The cheapest move…", "Replacement or mitigation") are gone; each group counts its advisories.
- Keyboard focus follows the open package. `j` and `k` move focus with it, also after a click, so
  Enter opens the package you walked to, not the row you clicked before; after Escape closes a
  package, `j` continues below its row instead of starting again at the top; Escape typed in the
  search box closes the package and leaves the cursor in the box. A row `j` walks to past the edge
  of the screen glides into view, or jumps there if your system asks for less motion. Tab reaches
  one row of the list, the open package's (else the last one opened, else the first), then that
  row's own links, then the package detail, instead of every row and every signal link in turn.
- Below 1181px, where a package opens as a sheet over the whole page, keyboard focus goes to the
  sheet's heading instead of staying on a row the sheet hides, and nothing under the sheet can be
  tabbed to. `j` and `k` still move from package to package, Escape closes the sheet and returns to
  the row you reached, and `/` closes it and puts you in the search box.
- A package listed twice, as under two advisories, is one Tab stop, and `j` walks past its second
  row instead of going back to the first. Escape from the search box, with no package open, moves
  focus to the list rather than to the top of the page. The All packages table marks the open row
  the same way the other tabs do (`aria-current`), and the summary band is part of the page's main
  landmark.
- A wide screen no longer opens the first flagged package by itself on load: the Findings list takes
  the full width, one line a row from 1440px up, until you open a package with a click, Enter or
  `j`. A link with `#pkg=` still opens its package on load, and closing a package gives the list
  its full width back. An open package now always shows in the address bar.
- The row you open or close stays where it was on screen, although the list beside an open package
  takes two lines a row and every row above it grows: a row thirty down used to slide off the
  bottom of the screen on the click that opened it. A `#pkg=` link scrolls its row into view on
  load, `j` and `k` put focus on the row they open, and a row they bring into view is no longer
  hidden under the sticky header.
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

- A package no signal fired on no longer says "the verdict comes from what lockrot could not learn"
  unless it is `unknown`: an `ok` one says every check ran and found nothing, a `finished` one that
  its verdict comes from the allowlist, any other just that no signal fired; a `finished` package's
  answer also quotes the allowlist's reason ("On the
  allowlist as finished, so it is not flagged: PHP-FIG interface packages are complete by design").
- A split package lockrot dates by its monorepo's tags (lockrot 0.13.0's `dated_by` and
  `installed_release_dated_by`, `illuminate/*` by `laravel/framework`) says so: the Released fact
  reads "your version, dated by laravel/framework", and Release branches names the rows whose dates
  came from it.
- Blast radius no longer says lockrot's exposure list "leaves out" a flagged direct requirement: the
  list holds only requirements with flagged packages under them, so the count line, the answer and
  the footnote say the others have nothing flagged counted under them.

- Blast radius under a filter that ranks nothing: the answer says what the filter shows ("The
  filter matches 20 flagged direct requirements themselves, and nothing listed under any of them: 12
  on lockrot's exposure list, below, and 8 with nothing flagged counted under them, at the end"), and that tail is a heading
  over rows always shown, never a fold.
- Blast radius under a search: a requirement found only through its evidence is said to be ("1 more
  matches “hoa” only in its own evidence"), and its cell reads its counts as one statement ("Of the
  15 flagged packages it pulls in, 14 that match are listed under wallabag/rulerz; the other one,
  listed under it, does not match").
- Blast radius on a phone: the ranking's sticky column head stops where the ranked rows do, so it
  never sits over the "flagged themselves" tail's own head.
- Blast radius colour: priority squares are a row's one loud colour; a verdict is a word in ink after
  a small dot of its colour, an age tick is ink until it passes the 3y or 5y guide, then that guide's
  colour, and the key names every colour left.
- Printed Blast radius: one rule, not two, where the last ranked row meets a tail.
- "Copy summary" says "by priority:" before the priority counts, and the band's advisory chips carry
  a visible "By severity", so neither reads as the other.

- In forced colours the selected tab is marked again: every tab used to wear the same underline.
- A screen reader hears each tab as "Findings 69", not "Findings69"; the summary band's priority
  chips and advisory-severity chips are named groups, so its two "high" chips are told apart; the
  All packages table has a name, and its sorted column's button no longer reads its arrow aloud.
- A table wider than its frame is a named region in the tab order, so the keyboard can scroll it;
  the key's "hover for why" sits on the last mark's line, says "it" when there is only one mark,
  and is left off a phone.
- All packages no longer scrolls the whole page sideways between 600 and 1024px: the table scrolls
  inside its own frame again. A search's "matched in" line wraps under the name instead of pushing
  the last column out of view at 1440px.
- On a phone, the key above All packages says what a full libyears bar is and what a row's left
  rule means; in forced colours, where every rule is the same ink, each row names its priority. The
  libyears number keeps clear of how the package gets in at 320px.
- Printing from the dark theme printed pale text on white paper; paper now always uses the light
  colours. The All packages table no longer loses its right-hand columns at the page margin.
- `j` and `k` work on a non-Latin keyboard layout (Russian and others) and with Caps Lock on: the
  page reads the physical J/K key when the layout printed no Latin letter there, so a Dvorak or
  Colemak reader's own letters on those keys still type nothing but themselves. `/` and `?` count
  wherever the layout puts them.
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
- On a wide screen, the All packages table and the Blast radius ledger use the width a closed detail
  panel leaves behind instead of leaving it empty.
- The advisory ledger no longer says a clean lock has no advisory twice, once above the bar and once
  again in its legend.
- On a phone, the tab row fades out on whichever side has tabs out of sight, under a small arrow
  button that scrolls it, and the selected tab, one opened from a shared link included, is scrolled
  fully into view. At 390px the row used to cut "Blast radius" mid-word and leave "Run data"
  off-screen with only a faint shadow to say so. The arrows are for a mouse or a finger: Tab still
  reaches the row once, and the arrow keys still move between tabs. From 768px up nothing changes.
- The All packages table draws an edge-shadow cue when it scrolls sideways; it used to clip a column
  with nothing on screen saying more of it exists.
- Every count in the filter rail is now the number of packages its button lists. "What the fix
  costs" counted advisories, so a package with two advisories fixed only on another branch read
  "Moving to another branch 2" over a list of one; a signal that fired twice on one package counted
  it twice; and on Blast radius Direct plus Transitive now adds up to the flagged count, the
  footnote's direct requirements included.

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
