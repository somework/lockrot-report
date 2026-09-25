# lockrot-report — design

The renderer behind `lockrot --format=html`, moved out of lockrot's `resources/report/` into its own
repository so it can be worked on as a product and written as a program: TypeScript, components,
tests that open a browser.

This document is the contract the code is written against. The parity inventory it was derived
from (every behaviour of the hand-written page, with file:line citations) lives outside the
repository, in the working notes of the extraction; what matters from it is restated here.

## 1. What ships

`npm run build` writes `dist/`:

| file                 | for                                                        | notes                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.html`        | lockrot's `--format=html`, lockrot.dev's published reports | Self-contained: CSS and JS inlined. Three placeholders, `{{TITLE}}`, `{{DESCRIPTION}}`, `{{DATA}}`. A `<meta http-equiv="Content-Security-Policy">` pins the inline script and style by sha256. |
| `lockrot-report.js`  | embedders (the viewer's sandboxed frame)                   | IIFE, global `LockrotReport`. Same code as inside `report.html`.                                                                                                                                |
| `lockrot-report.css` | embedders                                                  | Same stylesheet as inside `report.html`.                                                                                                                                                        |
| `manifest.json`      | whoever vendors a release                                  | `{name, version, schema: {report: [1]}, files: {<name>: sha256}, csp: {script, style}}`.                                                                                                        |

Nothing is minified. What lockrot vendors ends up inside a signed PHAR, and a reviewer should be
able to read it; the size cost is small next to the payload.

### 1.1 The template keeps every coupling a consumer relies on

These are depended on by lockrot, by lockrot.dev's scripts and by users' own scripts (`docs/ci.md`
documents a `sed` recipe). They are part of the renderer's public interface:

- exactly one `<script id="lockrot-data" type="application/json">{{DATA}}</script>`, attributes in
  that order, on one line;
- exactly one `<title>` and one `<meta name="description" content="…">`;
- the opening body tag is the literal `<body>`;
- no network reference of any kind: no `fetch(`, `XMLHttpRequest`, `@import`, `import(`, no external
  font, script, stylesheet or image. Links (`<a href>`) are fine; they are navigations, not loads.

The payload escaping is the producer's job and does not change: `</` → `<\/`, `<!--` → `<\u0021--`.

### 1.2 Booting

`lockrot-report.js` does two things when it is evaluated:

1. defines `window.LockrotReport = { version, mount(target, bundle), parse(text) }`;
2. **autoboot**: if `#lockrot-data` exists and holds non-whitespace text, it parses it and mounts
   into `#lockrot-app`.

`mount` returns `{ update(bundle), unmount() }`. Autoboot keeps the old embedding contract working
(write the payload into the slot, then load the script); `mount` is what an embedder should use.

A payload that is not JSON, or not a lockrot document, renders an explained error in place of the
report — never a blank page.

### 1.3 Content-Security-Policy

`report.html` carries, before any script or style:

```
default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; img-src data:; base-uri 'none'; form-action 'none'
```

`connect-src` falls back to `'none'`: the page cannot send what it renders anywhere, even if a
future bug lets a document inject markup. Inline `style="…"` attributes in markup would violate the
policy, so the renderer never emits them: dynamic values are set through the CSSOM (Preact's `style`
object prop), which CSP does not govern, or through classes. The e2e suite fails on any
`securitypolicyviolation` event.

An embedder that injects its own markup into a copy of `report.html` (lockrot.dev's provenance band)
must either keep that markup free of inline style/script or replace the meta policy with its own;
`manifest.json` carries the hashes for that.

## 2. Compatibility

- The renderer reads **report schema major 1** (`report.lockrot.schema`, and documents that predate
  the field). A higher major renders with a banner saying the document is newer than the renderer.
- Every field is optional on read. `model/normalize.ts` is the only place that knows about older
  shapes: `details` as `[]` or `{}`, `evidence` as an array, a missing `run`, `libyears`,
  `abandoned`, `finding.libyears`, `finding.replacement`, `metadata.installed_release`,
  `branches[].php`. The rest of the code sees a fully populated `Model` and never checks for
  `undefined`.
- Unknown fields are ignored; unknown enum values (a verdict, a signal id, a severity) are kept and
  rendered neutrally, never dropped and never a crash.
- Fixtures: `fixtures/bundles/` holds real bundles from lockrot 0.11.0 (via `--dev`, `--all`, the
  install-time path without `details`, an empty lock) and one 0.10.0 capsule. Every one of them must
  normalise and render.

## 3. Source layout

```
src/
  main.ts                 IIFE entry: LockrotReport global, mount(), autoboot
  template.html           the report.html skeleton, before inlining
  model/
    types.ts              Bundle (wire, all-optional) and Model (normalised, all-present)
    normalize.ts          unknown → Model | NormalizeError
  domain/                 pure functions, no DOM, no Preact; unit-tested
    vocab.ts              verdicts, priorities, signals (S1–S10), tones, definitions, doc links
    format.ts             day, ageText, plural, count phrases
    links.ts              safeHref, packagistUrl, cveUrl, repoHost
    install.ts            installCommand (the clipboard guard)
    query.ts              parseQuery, the search grammar
    searchHits.ts         where free text found a package: split, evidence excerpt (PD-SEARCH-1)
    severity.ts           advisory severity normalisation
    advisories.ts         advisoriesOf, fixLadder, advisory sort and match
    filters.ts            filter groups, population per view, matches(), rail facet counts
    priority.ts           priorityWhy — every rule of a finding's priority, applied or not
    answer.ts             the open package's answer sentence and what it pulls in (S7)
    libyears.ts           ledger items, sort key, reason, row phrases
    timeline.ts           release branches: order, folds, one shared axis, age phrases
    age.ts                a Findings row's age scale: signal, thresholds, shared maximum
    radius.ts             blast-radius cards
    sniff.ts              the two places the page reads PHP-rendered text (isolated, tested)
  state/
    state.ts              State, Action, reducer
    hash.ts               parse/serialise the fragment (format unchanged, see §4)
  ui/                     Preact components, one folder per surface, CSS next to the component
  styles/                 tokens.css, base.css, print.css
tests/unit/               vitest, mirrors src/
e2e/                      Playwright; runs against the built page in build/pages/ (§6)
legacy/                   lockrot's resources/report/ at the commit in legacy/SOURCE_COMMIT
fixtures/bundles/         real payloads
scripts/                  build and page assembly
```

Rules the lint config enforces: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`, no
`dangerouslySetInnerHTML`. JSX escapes; that is the whole security model for markup.

## 4. State and the address bar

State is one object owned by a reducer in `App`:

```ts
{ view, q, pkg, sort, sortDesc, filters: { prio, verdict, scope, signal, sev, fix, since }, disclosure }
```

`disclosure` holds the Blast radius rows and folds the reader opened or closed; like `sort` it is not
written to the fragment (PD-RADIUS-3).

The fragment format is a documented user feature (`docs/ci.md`) and **does not change**:
`view=<v>&q=<enc>&prio=<enc a,b>&verdict=…&scope=…&signal=…&sev=…&fix=…&since=…&pkg=<enc>`,
groups in that order, `view` omitted when `findings`, `pkg` omitted while no package is open (the
legacy page also left out the package it opened by itself; this page opens none, PD-ROWS-9), empty
state → no fragment. Always `history.replaceState`, never `pushState`; a `SecurityError` (an
opaque-origin frame) switches writing off for the page's life.

Changes from the legacy page, each a fix:

- a malformed escape in the fragment skips that piece instead of blanking the page;
- an unknown `view` falls back to `findings`;
- `hashchange` is honoured (a link pasted into an open page applies);
- a whitespace-only query is not an active filter and is not written;
- the fallback URL keeps `location.search`.

Free text still means every word somewhere in the name, version, verdict or evidence, and `q=` is
written as before; only the page's explanation of where a word matched is new (PD-SEARCH-1).

## 5. Behaviour: parity, and the deliberate differences

Parity is the default: vocabulary, texts, sort orders, the three-step Escape, `/` `j` `k` `?`
`Enter`, the theme key `lockrot-theme`, boot-only ledger and glossary, "detail stays open while
filters hide it". The legacy auto-open of the first flagged package on wide screens is gone
(PD-ROWS-9).

Fixed on purpose during the extraction, proved against the legacy page (§6 says which of these an
e2e test still covers):

| id              | legacy                                                                                                  | new                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| M1              | severity is compared raw; `moderate`/`High` get no ledger bucket and sort first                         | case-insensitive; `moderate` → medium; anything else → unrated bucket, raw text still shown |
| M2              | S10 has no name, sorts between S1 and S2, absent from the glossary                                      | S10 named "a check could not run", numeric id order                                         |
| M5              | Enter on a link inside a row toggles the detail                                                         | the link is followed                                                                        |
| M6              | package-table rows are not focusable and show no selection                                              | focusable, `aria-current` (as every tab's rows, PD-ROWS-12)                                 |
| M7/M8/M9        | `j`/`k` walk the document order, not the rows on screen, and can open packages with no row              | walk the rendered rows of the current view                                                  |
| M10             | `j`/`k` act behind the open glossary                                                                    | ignored while a dialog is open                                                              |
| M11             | first click on the theme button does nothing under an OS dark preference                                | the button always reflects the effective theme                                              |
| M12             | a bad `%` escape in the fragment blanks the page                                                        | the piece is skipped                                                                        |
| M13             | an unknown `pkg=` on a narrow screen locks scrolling                                                    | the detail says the package is not in this report                                           |
| M14             | an unrecognised `view=` leaves no tab selected and shows Run content with the ledger still up           | falls back to Findings, with the Findings tab marked selected                               |
| M17             | ledger filter buttons carry no pressed state for assistive tech                                         | `aria-pressed`                                                                              |
| M19             | every healthy package counts as "Already accepted"                                                      | only flagged findings the baseline knows                                                    |
| M20             | a clean report says "Nothing matches this filter"                                                       | it says nothing was flagged                                                                 |
| M21             | "1 of 1 flagged packages"                                                                               | singular forms                                                                              |
| M24/M25         | radius card count disagrees with the rows it lists                                                      | the count is the rows listed; a flagged parent says so                                      |
| M26             | timeline label pairs the highest version with another tag's date                                        | label and date come from the same tag                                                       |
| M28             | glossary fallback renders below the footer                                                              | fixed-position overlay                                                                      |
| M29             | ledger tooltip says "except ok and finished" but also excludes unknown                                  | text matches the count                                                                      |
| C2              | first year tick on the timeline is always dropped                                                       | kept                                                                                        |
| WIDE            | measured once at boot                                                                                   | follows `matchMedia` changes                                                                |
| WS-Q            | a whitespace-only query counts as one active filter (raw, untrimmed `state.q`)                          | trimmed first: not an active filter, and not written to the address bar                     |
| SEARCH-FALLBACK | `writeHash()` falls back to `location.pathname` when the computed state is empty, dropping any `?query` | `location.search` survives a reset to the bare path                                         |
| hashchange      | no `hashchange` listener at all                                                                         | a link pasted into an open page applies live                                                |

Changed on purpose after the extraction, so a reader meets the answer before the reference
("before" is the legacy page and 0.12.0 alike):

| id                          | before                                                                      | new                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PD-SUMMARY-1/PD-SUMMARY-5   | nothing said how many packages carried each priority                        | a counts line and a phone-fold bar, both since replaced by PD-SUMMARY-6: they said it twice                                                   |
| PD-SUMMARY-2                | the header said nothing about the run's gate                                | "no gate" or "gate: `<value>`" beside the version, with a popover saying what it means                                                        |
| PD-SUMMARY-3                | the Run tab's fail-on read "none" for a document without `run.fail_on`      | an em dash; "none" only when the run said so                                                                                                  |
| PD-SUMMARY-6                | four equal ledger columns, no single "how bad" read                         | a lead: "69 of 271 packages flagged", chips, a waffle beside them (a square a package); columns below, phone-folded                           |
| PD-SUMMARY-7                | one verdict bar, 70% `ok` green                                             | a bar per flagged verdict, most common first, split into the priority tones the chips use; the rest one quiet line                            |
| PD-SUMMARY-8                | a full-width advisory bar: 2 advisories drawn as big as 69 findings         | a square per advisory, severity chips, each package with its advisories' `fixed_by`, verbatim                                                 |
| PD-SUMMARY-9                | libyears was a number and three lines of text                               | the number over one bar split into direct requirements and what they pull in, in neutral ink                                                  |
| PD-GLOSSARY-1               | the search hint spelled out every key and search term, on every tab         | "Press ? for keys and search syntax"; the rest is the glossary's "Keys and search"                                                            |
| PD-GLOSSARY-2               | the glossary opened as one long scroll                                      | only the verdicts are in view; the other sections fold                                                                                        |
| PD-GLOSSARY-3               | the glossary's link read "full reference"                                   | "How lockrot decides (lockrot.dev)", to `#verdicts-and-priority`                                                                              |
| PD-GLOSSARY-4/PD-GLOSSARY-5 | a verdict pill linked out, unreachable offline                              | the detail header's pill opens a definition popover; a row's pill stays plain, titled, so a click opens the package                           |
| PD-GLOSSARY-6/PD-SUMMARY-4  | Escape knew nothing of popovers                                             | an open popover closes first, and alone                                                                                                       |
| PD-GLOSSARY-7               | "In the glossary" opened the glossary at the top                            | it scrolls to that verdict's entry, marks it briefly and focuses it                                                                           |
| PD-GLOSSARY-8               | a definition named a config key, not the run's value                        | the value leads, the key beside it: "5 years (release-high-years)"                                                                            |
| PD-GLOSSARY-9               | "finished" covered only the built-in allowlist                              | it says how a reader accepts a package themselves, `extra.lockrot.ignore`                                                                     |
| PD-DETAIL-1/PD-DETAIL-2     | the detail led with the baseline and showed every reference section         | "Follow the upstream" first; reached-by, lock entry and provenance fold, closed                                                               |
| PD-DETAIL-3                 | two nested scroll regions; a new package kept the last one's scroll         | `.shell-detail` alone scrolls; a new package starts at the top                                                                                |
| PD-DETAIL-4                 | the detail never said a filter hid its package from the list                | it says so, with "Clear filters"; the search status says so too                                                                               |
| PD-DETAIL-5                 | at 1440px the side detail's end could not be reached                        | the wheel chains into the page; the column makes room for the footer (§8)                                                                     |
| PD-DETAIL-6                 | the header was a name, pills, tags and links; the chain folded away         | an answer sentence (verdict, reach, replacement, advisories), four key facts, the chain with clickable hops, and S7's flagged pulls           |
| PD-DETAIL-7                 | "Why this is critical" named only the rules that applied                    | every rule of `priorityWhy` in order, applied or not ("no step down"), on a crit·high·med·low track; "So:" is `finding.priority`              |
| PD-DETAIL-8                 | three ages on one screen; the rung said "only reached through" one way in   | the answer quotes the fact's own age; "on 2.x, newer than yours"; one `waysIn` list for sentence, rung and chain                              |
| PD-DETAIL-9                 | a missing fact vanished; 0.0 read as healthy; "S7 below names each one"     | four facts always, a gap says "not recorded"; 0.0 says "nothing newer"; "Name all N" lists them by verdict                                    |
| PD-DETAIL-10                | an abandoned age: ink above, amber in the release-branches answer           | a verdict that does not rest on age keeps it in ink there too; forced-colours rungs are dotted                                                |
| PD-DETAIL-11                | the age fact took four labels, and a wrapped label dropped its value a line | one "Last release" label, whose release in the note; values share one subgrid row; 2×2 by panel width                                         |
| PD-DETAIL-12                | "Signals": equal boxes of the fired ones; quiet checks never named          | "Checks" after the ladder: S1–S10 named in a 5×2 strip, tally, quiet ids, fired rows by level; S7 a package · verdict · via table             |
| PD-ROWS-1                   | a row showed up to three signal lines                                       | the highest-level signal and "+N more signals"; print shows them all                                                                          |
| PD-ROWS-2                   | nothing showed an age against the run's thresholds                          | an age scale: warn and high ticks, a dot at the S8 (branch stopped) / S2 (no stable release) / S4 (no push) age                               |
| PD-ROWS-3                   | each row scaled its own track, with no legend                               | one legend and one maximum per list; `abandoned`/`pinned` rows get a neutral dot                                                              |
| PD-ROWS-4                   | ~90px cards; "+N more signals"; a dot on a 64px track; a floating legend    | one ledger row (36px wide, two lines beside the detail, three on a phone), wrapped, never cut; one axis, `max(10, 2×high)`, keyed in the head |
| PD-ROWS-5                   | every row repeated its verdict, reason and parent in full                   | a value the row above showed is `--muted` (a repeated verdict keeps its tone; none in critical); a one-signal filter makes every row quote it |
| PD-ROWS-6                   | nothing summed a group up; 14 alike hoa/* cards in a row                    | a serif sentence per priority, counted by verdict and reach; one above 3+ consecutive rows sharing verdict and way in                         |
| PD-ROWS-7                   | a second click or Enter on the open row closed its detail                   | a row opens its package and never closes it (Findings, Packages, Advisories, Blast radius); Close and Escape close                            |
| PD-ROWS-8                   | a tinted band above a run; forced colours drew a solid track past each bar  | the run note is unfilled, only its tone rule; forced colours draw no track under a bar                                                        |
| PD-ROWS-9                   | ≥1181px opened the first flagged package on load, the list squeezed beside  | nothing opens by itself: the list takes the full width; a click, Enter, `j`/`k` or `#pkg=` opens one; Close gives the width back              |
| PD-ROWS-10                  | opening a row reflowed the list and slid a row 30 down off the screen       | the row acted on keeps its place on screen through open and close; a `#pkg=` row scrolls into view; `j`/`k` focus it                          |
| PD-ROWS-11                  | every row and its links a Tab stop; `j` after Escape went to the top        | one Tab stop a list: the open, else last opened, else first row; `j`/`k` move from the focused row; Escape in search keeps focus              |
| PD-ROWS-12                  | a sheet hid the focused row; `j` stuck on a package listed twice            | a sheet takes focus, the page under it `inert`; `/` closes it; rows walked by position; Esc in search goes to the list                        |
| PD-SEARCH-1                 | "hoa/" listed wallabag/rulerz; nothing on its row said why                  | the status splits the count by where it matched, naming ≤3 packages that only mention it; such a row quotes its evidence around the hit       |
| PD-TIMELINE-1               | the first year label lost half its width off the axis                       | the axis runs from 1 January of the oldest year, labelled at the left edge, to a "today" rule labelled under it                               |
| PD-TIMELINE-2               | labels floated beside each dot and wrapped around it                        | a table: branch, a line from last release to today, latest version, raw php constraint; one line a row                                        |
| PD-TIMELINE-3               | a package without maintained branches showed each version twice             | the version once; its third column is the release date, so every table keeps the same four columns                                            |
| PD-TIMELINE-4               | a jargon legend; the installed lane red at any age                          | one-line key; you a ring, newest a disc; your line in its age tone; the 3y/5y guides captioned in place                                       |
| PD-TIMELINE-5               | lanes sorted by date, so 3.x could sit above 4.x                            | newest version first; date order when any branch name is not a version                                                                        |
| PD-TIMELINE-6               | every branch drawn; old ones buried the two that matter                     | three or more older than yours fold into one "N older" row, a tick each; over four between newest and yours too                               |
| PD-TIMELINE-7               | nothing said how far behind the reader is                                   | two sentences first: your branch and its age; how many are newer, the newest's version, date and php                                          |
| PD-TIMELINE-8               | a dev-branch checkout had no row                                            | a snapshot row from the lock's own date and constraint, a diamond; its age never takes a release-age tone                                     |
| PD-TIMELINE-9               | every fold a native `<details>` (PD-DISCLOSURE-1)                           | a fold is a button with `aria-expanded` in its row header: a `<details>` cannot be a table row                                                |
| PD-TIMELINE-10              | "newest" named the highest version, whatever its date                       | "highest" instead when a lower branch released after it; warn and high guides differ by dash, not colour alone                                |
| PD-TIMELINE-11              | a minimum stub pinned months of releases to one spot left of today          | every dot at its true date, a recent one on the rule; a year beside a guide moves aside; guides say "3y", key "ago"                           |
| PD-TIMELINE-12              | the newest's line was accent at any age; your row tinted grey               | the newest keeps an accent dot and rule, its line neutral; your row washed in your age tone; markers haloed                                   |
| PD-LEDGER-1                 | "No advisory affects this lock" even when the check may not have run        | "No advisory found; N packages could not be confirmed clear", in a neutral tone                                                               |
| PD-LEDGER-2                 | a legend entry, a filter toggle, looked like plain text                     | a chip with hover, focus and pressed states, and a title naming the click                                                                     |
| PD-DISCLOSURE-1             | each `<summary>` drew its own text-glyph marker                             | one CSS-drawn triangle for every `<summary>`, with hover and focus states                                                                     |
| PD-TABS-1                   | at 390px "Blast radius" cut mid-word, "Run data" off-screen, no clear cue   | the hidden side fades under a chevron that scrolls the row (no Tab stop, hidden from AT); the selected tab scrolls into view                  |
| PD-RAIL-1                   | the fix-cost rail counted advisories but kept packages: otphp "2", one row  | a rail count is the packages its button lists: once per fix shape or signal; Blast radius counts rows, listed packages and the footnote       |
| PD-RADIUS-1                 | a card per requirement, a meter bar, a flat list                            | an answer sentence; a ranked ledger row each: squares on one scale by priority, what it pulls in, their ages                                  |
| PD-RADIUS-2                 | what a card reached but did not list went unsaid                            | a hollow ring and "+N"; "listed under X" jumps to X's row, opens it, focuses it, marks the packages                                           |
| PD-RADIUS-3                 | every card's packages drawn at once                                         | a toggle opens a row as a chain tree; one-each rows fold (closed on a phone); `#pkg=` opens its row                                           |
| PD-RADIUS-4                 | requirements with nothing listed had no card                                | two tails: flagged themselves; reaching packages only through rows above, by package reached                                                  |
| PD-RADIUS-5                 | a flagged direct requirement not in exposure vanished                       | a footnote names each; each name opens its detail, as on Findings                                                                             |
| PD-RADIUS-6                 | a filter silently changed what "flagged" counted                            | under a filter the sentences say "matching", a note gives the unfiltered counts, a row says what the filter hides under it                    |
| PD-RADIUS-7                 | (new layout) squares sat under the age head beside an open package          | from 600 to 989px the squares stay under the name; the right column is the age axis alone, every age a tick or a whisker                      |
| PD-RADIUS-8                 | "your 29 direct requirements" counted exposure[] as every requirement       | every count is "of the N direct requirements lockrot's exposure list names"; the count line adds the left-out ones                            |
| PD-RADIUS-9                 | "not flagged for age" was drawn across the warn and high guides             | a muted dash in the number's place, the words in its name and the key; a row listing nothing shows "–", not "0"                               |
| PD-RADIUS-10                | one "years since release" head over two kinds of age                        | "Their years since release" over ranked rows; the flagged-themselves tail has its own head, "Its own…"                                        |

Changed on purpose, and not a legacy bug:

- An advisory whose severity the page cannot bucket sorts with the unrated ones, last. The legacy
  page sorted it first, by accident of `indexOf` returning -1 (critic C1).

Deliberately kept although odd: rail counts are per-tab totals, not faceted (each counts packages,
the unit the rail filters in, PD-RAIL-1); the detail survives a
filter that hides its package; `data-goto` keeps the detail open.

## 6. Testing

- **Unit** (vitest): every `domain/` and `state/` module, `model/normalize` over every fixture. The
  legacy `lib.test.js` cases are ported verbatim as the first tests of `format`, `links`, `install`,
  `query` and `libyears`.
- **Components** (vitest + happy-dom + @testing-library/preact): the parts with logic in them —
  detail panel sections, timeline, ledger.
- **E2E** (Playwright, Chromium; Firefox and WebKit in CI): one behavioural suite, run against
  `build/pages/`. It was written and made green against the legacy page first, during the
  extraction, which proved the tests tested something, and ran against both pages until lockrot
  0.12.0 stopped shipping the legacy one; the new page is the only page it runs against since. §5's
  table stays the record of the differences that comparison found and fixed on purpose. Every row
  an e2e test covers carries the row's id in a comment on that test, and later deliberate changes to
  the new page are recorded there the same way; M1, M19, M24, M26 and C2 are covered by a unit test
  instead (its `describe`/`it` name carries the id); M25 is e2e-covered too
  (`e2e/detail-and-copy.spec.ts`), alongside its own unit test (`tests/unit/domain/radius.test.ts`,
  `tests/unit/ui/views.test.tsx`); M8/M9 and WIDE have no test naming their id at all yet. Page-quality checks that apply regardless of any legacy comparison: axe (no
  serious or critical violations), zero CSP violations, both colour schemes, 320/768/1024/1440.
- **Build checks**: the built `report.html` contains each coupling in §1.1 exactly once, none of the
  forbidden strings, and building twice gives identical bytes.

## 7. Release and vendoring

- A tag `vX.Y.Z` builds `dist/`, attests it (`actions/attest-build-provenance`) and attaches the four
  files to a GitHub release.
- lockrot vendors `report.html` and `manifest.json` into `resources/report/`; its `HtmlFormatter`
  fills three placeholders. An update script downloads a release, verifies the attestation with
  `gh attestation verify`, checks sha256 against the manifest and writes the files; lockrot's CI
  checks the vendored bytes against the manifest.
- lockrot.dev takes `lockrot-report.js`/`.css` for its frame and `report.html` for published
  reports from a renderer release instead of from a lockrot tag.
- Order of changes across repositories: data first in lockrot (schema minor, renderer ignores
  unknown fields), rendering second here, the pin bump in lockrot's release PR.

## 8. Layout and interaction

The shell (`src/ui/App.tsx` and its neighbours) keeps the legacy page's visual language (tokens,
type, tones, vocabulary) and changes layout only where the legacy page failed a reader.

**Breakpoints.** Three, all driven by `matchMedia` in `ui/useWide.ts` and mirrored in
`ui/app.css`:

| width        | layout                                                                                 |
| ------------ | -------------------------------------------------------------------------------------- |
| ≥ 1181px     | rail · list, plus a detail column once a package is open (the legacy WIDE layout)      |
| 760 – 1180px | rail · list; the detail opens as a full-screen sheet                                   |
| < 760px      | one column: the summary's lead, its folded tier, a "Filters" disclosure, then the list |

The legacy page pushed the findings below the whole ledger and the whole rail at 320px, so a phone
reader scrolled past two screens of bars and buttons before the first package. Under 760px the
summary band keeps its lead (the flagged figure, the priority chips and the waffle) and folds
its three supporting columns into one line that counts them (PD-SUMMARY-6), and the rail becomes a
closed `<details>` whose summary counts the rail filters that are on. The Findings rows follow the
list's own width, not the viewport's (a container query, PD-ROWS-4): one line from 990px of list
(the width the three text columns need at their 90th percentile across the fixtures), two from
480px (the list beside an open package, 570-790px at 1280-1920), three below that. With nothing
open, which is how every page without `#pkg=` loads (PD-ROWS-9), the list is 910-1230px at
1181-1920, so a wide screen's first sight is one line a row from 1440px up. At every width a cell
too narrow for its value wraps it, never an ellipsis.
Opening a package there switches the list to two lines a row, and closing it back, so every row
above the one acted on changes height. `ui/rowAnchor.ts` measures that row before a `select` is
dispatched (a click, Enter, `j`/`k`, Close, Escape) and `App` scrolls the page by however far it
moved before the browser paints, so it stays where the reader saw it (PD-ROWS-10). `html`'s
`scroll-padding-top` keeps a row brought into view clear of the sticky header and column head.

**The summary band's lead** is the first five seconds: how many packages are flagged, out of how
many were checked, with the priority chips that filter by it and a waffle of every package
(`ledger/PriorityLedger.tsx`, PD-SUMMARY-6). The gate is in the header (below).

**Sticky offsets are measured, not guessed.** Only the header band (brand, run facts, tabs) is
sticky, and only from 760px up. `Header` publishes its real height as `--topbar-h` through the
CSSOM (a ResizeObserver); the rail and the detail column stick under it and scroll on their own
when taller than the viewport. The legacy page hard-coded 196px and overlapped a wrapped header. The
Findings list's column head (PD-ROWS-4) sticks under it too, within the list, so the age axis'
captions stay over the bars they measure.
Both columns are at most `--sticky-room` tall (`ui/app.css`): the viewport less the topbar and a
16px gap on each side. At the page's end the footer takes the bottom of the viewport, so while the
footer is on screen `--sticky-room` also subtracts `--footer-h`, never below 50vh; `Footer.tsx`
measures it and toggles `:root.footer-in-view` from an IntersectionObserver. Subtracting it only
while the footer is visible keeps a usable column on a short viewport. Where the 50vh floor wins,
the panel's top slides under the header at the page's end, an accepted limitation (PD-DETAIL-5).

`.shell-detail` (`is-side`/`is-sheet`) alone owns the detail's geometry and scrolling; `Detail`
only lays out its children, and opening another package starts at the top (PD-DETAIL-3). A wheel
over `is-side` chains into the page once its own content ends, since page scroll is what carries it
from its in-flow position into its stuck one (PD-DETAIL-5). `is-sheet` keeps
`overscroll-behavior: contain`: it covers a page whose scroll is locked (M13).

**The detail panel** leads with the answer: the header (name, version, pills, links; the only part
that sticks), then a serif sentence composed from the finding's own fields, its key facts, how it
gets in and what flagged packages it pulls in (PD-DETAIL-6), then the priority ladder
(PD-DETAIL-7) and the checks behind the verdict (PD-DETAIL-12), then "Follow the upstream" when
there is one, the baseline, every advisory and the release branches. "The lock entry" and "Provenance" come last, each a `<details>` closed by
default (PD-DETAIL-1/PD-DETAIL-2).

**Tabs** follow the ARIA tabs pattern: one tab in the Tab order, arrows/Home/End move and select,
the current view's column is the `tabpanel`. When the tab row overflows it scrolls sideways
(PD-TABS-1): each side with tabs out of sight fades into the header's surface under a chevron
button that pages the row, and the selected tab is scrolled into full view on load and on every
switch, instantly under reduced motion. The chevrons sit outside the `tablist`, `tabIndex=-1` and
`aria-hidden`: pointer affordances only, since the single Tab stop and the arrow keys already reach
every tab. In forced colours the fade goes and the chevrons keep the system's button colours.

**The detail sheet** locks page scroll only while it is shown with content in it (M13). The
glossary is a native `<dialog>`; where `showModal()` throws it opens non-modal but pinned
`position: fixed` over the page with a spread-shadow backdrop, and focus is moved in and returned
by hand (M28). It opens with only the verdicts in view, the other sections folded (PD-GLOSSARY-2);
opened from a pill's "In the glossary", it scrolls to, marks and focuses that verdict
(PD-GLOSSARY-7).

**Folds.** Every `<summary>` on the page draws one marker, a CSS-drawn triangle in
`styles/base.css`, not a text glyph whose shape depends on the viewer's fonts; a surface styles only
its summary's layout (PD-DISCLOSURE-1).

**Forced colours** flatten authored colours to the page background, so every mark drawn from a
background or border (ledger bars, legend chips, the age scale, the fold marker) has its own
`@media (forced-colors: active)` rule in system colours, and the age scale's dot shows its zone by
shape. `e2e/forced-colors.spec.ts` emulates the mode.

**Keyboard** decisions are one pure function, `ui/keyboard.ts#decideKey`:

- `j`/`k` move from the row that holds focus, else the open package, through the rows the current
  view draws (`views/order.ts#renderedPackages`), clamped at both ends; with neither on screen,
  both start at the first row. There is no separate cursor, so a row clicked, a package opened from
  an advisory, or the row Escape just handed focus back to is where `j` continues from (fixes M7–M9;
  the legacy first `j` after its boot pick re-selected the same package). On load nothing is open,
  so `j` opens the first row. Focus moves to the row `j`/`k` open, as it stays on a row clicked
  (PD-ROWS-10), so focus and the open package agree and Enter opens the row on screen as open
  (PD-ROWS-11). The row is brought into view with `block: "nearest"`, `behavior: "smooth"` unless
  `prefers-reduced-motion: reduce` (checked in script: a CSS `scroll-behavior` would also glide
  PD-ROWS-10's instant `scrollBy`). A row is placed by its position among the view's rows, not its
  name, so a package listed twice is walked row by row (PD-ROWS-12).
- A sheet (below 1181px) covers the whole page, so a row under it can hold no visible focus
  (WCAG 2.4.11). A reader's own open (click, Enter, `j`/`k`) puts focus on the sheet's heading
  (`[data-detail-focus]`, `tabindex="-1"`), and the header, summary, rail, list and footer are
  `inert` while it is up: Tab stays in the sheet. `j`/`k` still walk the list under it, re-focusing
  the heading so it is announced; Escape and Close hand focus to the row reached; `/` closes the
  sheet on its way to the search box. A `#pkg=` sheet on load leaves focus alone (PD-ROWS-12).
- Roving tabindex (`ui/rowCursor.ts`, PD-ROWS-11): one row of the list has `tabindex="0"` — the open
  package's, else the one last opened, else the first — every other row `-1`, and the links inside
  a row are `-1` except on that row. Tab reaches the list once, then that row's links, then the
  detail. A package listed twice (Advisories, Blast radius) is a Tab stop on its first row only;
  every one of its rows carries `aria-current` while it is open (PD-ROWS-12).
- Nothing but Escape acts while the glossary is open (M10). Printable shortcuts are ignored while
  focus is in any text field, and every shortcut is ignored with Ctrl, Meta or Alt held.
- Enter/Space toggle a row only when the key lands on the row itself, not on a link or control
  inside it (M5).
- A verdict pill's definition (`ui/common/common.tsx`, PD-GLOSSARY-4) and the gate fact are native
  `popover="auto"` elements opened by a `<button popovertarget>`. They never trap focus, so
  `j`/`k`/`?` still act while one is open. Escape is left to the browser, which closes an open
  popover on its own (`decideEscape` returns `ignore`).
- Escape closes one thing per press: an open popover first (PD-GLOSSARY-6/PD-SUMMARY-4), then the
  glossary, then detail (focus returns to the row whose `data-pkg` equals the closed package, found
  by attribute comparison; pressed in a text field, focus stays in the field, PD-ROWS-11), then the
  search box, handing focus to the list's Tab stop (none on a tab without rows: it just blurs,
  PD-ROWS-12).
- The summary band sits inside `<main>` with the shell, so no content is outside a landmark.

**Theme.** The button names the action relative to the _effective_ theme, the pinned one or the
OS preference (M11). The choice persists under `lockrot-theme`; an unrecognised stored value is
ignored rather than written onto the page.

**The gate fact** is a quiet fact in the header, beside "lockrot `<version>`": "no gate" or
"gate: `<value>`", opening a popover that says what the run's `--fail-on` means for its exit code.
A document from before `run.fail_on` existed shows neither (PD-SUMMARY-2).

**Address bar.** `ui/useHashState.ts` reads the fragment once at boot and nothing else: a `pkg=` in
it opens that package at any width and scrolls its row into view, and without one no package is
open (PD-ROWS-9, PD-ROWS-10). It writes after every state change, and applies `hashchange` by
replacing the state from the new fragment while keeping the table's sort order.
