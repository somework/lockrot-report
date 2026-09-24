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
    severity.ts           advisory severity normalisation
    advisories.ts         advisoriesOf, fixLadder, advisory sort and match
    filters.ts            filter groups, population per view, matches(), rail facet counts
    priority.ts           priorityWhy — the page's explanation of a finding's priority
    libyears.ts           ledger items, sort key, reason, row phrases
    timeline.ts           branch timeline scale and ticks
    age.ts                a Findings row's age scale: which of S8/S2/S4 to plot, against which thresholds (PD-ROWS-2)
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
{ view, q, pkg, pkgAuto, sort, sortDesc, filters: { prio, verdict, scope, signal, sev, fix, since } }
```

The fragment format is a documented user feature (`docs/ci.md`) and **does not change**:
`view=<v>&q=<enc>&prio=<enc a,b>&verdict=…&scope=…&signal=…&sev=…&fix=…&since=…&pkg=<enc>`,
groups in that order, `view` omitted when `findings`, `pkg` omitted while the open package is the
page's own automatic pick, empty state → no fragment. Always `history.replaceState`, never
`pushState`; a `SecurityError` (an opaque-origin frame) switches writing off for the page's life.

Changes from the legacy page, each a fix:

- a malformed escape in the fragment skips that piece instead of blanking the page;
- an unknown `view` falls back to `findings`;
- `hashchange` is honoured (a link pasted into an open page applies);
- a whitespace-only query is not an active filter and is not written;
- the fallback URL keeps `location.search`.

## 5. Behaviour: parity, and the deliberate differences

Parity is the default: vocabulary, texts, sort orders, the three-step Escape, `/` `j` `k` `?`
`Enter`, the theme key `lockrot-theme`, boot-only ledger and glossary, auto-open of the first
flagged package on wide screens, "detail stays open while filters hide it".

Fixed on purpose during the extraction, proved against the legacy page (§6 says which of these an
e2e test still covers):

| id              | legacy                                                                                                  | new                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| M1              | severity is compared raw; `moderate`/`High` get no ledger bucket and sort first                         | case-insensitive; `moderate` → medium; anything else → unrated bucket, raw text still shown |
| M2              | S10 has no name, sorts between S1 and S2, absent from the glossary                                      | S10 named "a check could not run", numeric id order                                         |
| M5              | Enter on a link inside a row toggles the detail                                                         | the link is followed                                                                        |
| M6              | package-table rows are not focusable and show no selection                                              | focusable, `aria-selected`                                                                  |
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

Changed on purpose after the extraction, so a reader meets the answer before the reference (the
"before" column is the legacy page and 0.12.0 alike):

| id                         | before                                                                                                                                                                                                | new                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PD-SUMMARY-1               | nothing above the ledger said how many packages carried each priority; the phone fold's summary said only "N flagged of M packages"                                                                   | one line, "N critical · N high · N medium · N low of M packages" (a zero bucket and `none` skipped; `M` is `packagesChecked`, falling back to `findings.length`), above the ledger from 760px up and as the phone fold's own `<summary>` below it, so a phone reader sees it without unfolding anything; a clean report reads "Nothing flagged in M packages"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| PD-SUMMARY-2               | the header said nothing about the run's gate                                                                                                                                                          | a quiet button beside the lockrot version, "no gate" when `run.fail_on` is `"none"`, "gate: `<value>`" otherwise, opening a native popover that says what `--fail-on` does and does not mean; absent for a document written before `run.fail_on` existed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PD-SUMMARY-3               | the Run tab's fail-on row printed "none" both for `--fail-on=none` and for a document without the field                                                                                               | an em dash for the missing field; "none" only when the run said so                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| PD-GLOSSARY-1              | the hint under a filterable tab's search box spelled out the shortcut keys, the seven search keys and the address-bar note, on every tab                                                              | one short line, "Press ? for keys and search syntax"; the rest is the glossary's "Keys and search" section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PD-GLOSSARY-2              | the glossary opened as one long scroll: verdicts, signals, libyears and priority all in view                                                                                                          | only "The nine verdicts" is in view; signals, libyears, priority and "Keys and search" each fold behind their own `<summary>`, disclosed like the ledger and rail folds (§8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PD-GLOSSARY-3              | the glossary's header link read "full reference" and pointed at the bare `DOCS_URL`                                                                                                                   | it names its destination, "How lockrot decides (lockrot.dev)", and points at `${DOCS_URL}#verdicts-and-priority`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| PD-GLOSSARY-4              | a verdict pill carrying `docs` was an `<a>` out to lockrot.dev, unreachable from a report opened offline (a PHAR, a `file://` path)                                                                   | a `<button>` opening a native `popover="auto"` with the definition, an "In the glossary" button and the lockrot.dev link; visual review: fixed and viewport-centred with no dimming, it could land squarely on the very row it opened from on a short page — it now carries its own `::backdrop` (matching `.glossary`'s) and sits biased toward the top of the viewport (`inset: 12% 0 auto 0`) instead of dead centre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| PD-GLOSSARY-5              | a Findings row's own verdict pill carried no `docs`                                                                                                                                                   | it does, so its popover gives the definition without leaving the row; a click on it does not toggle the row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PD-GLOSSARY-6/PD-SUMMARY-4 | Escape's chain was glossary, then detail, then search focus                                                                                                                                           | an open popover (a verdict pill's, the gate fact's) closes first, ahead of the glossary and the detail, by the browser's own dismissal: `decideEscape` returns `ignore`, so `prevents()` never cancels the keydown and one press never closes two things                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PD-GLOSSARY-7              | "In the glossary" (a verdict pill's popover) opened the dialog scrolled to the top, same as the "?" shortcut                                                                                          | it scrolls to that verdict's own `dt`/`dd` pair, marks the pair with a highlight that fades (`prefers-reduced-motion` drops the fade, not the mark — `Glossary.tsx#useHighlightTerm`, `app.css`'s `glossary-highlight-fade`), and focuses the term itself, ahead of `useDialog`'s own default focus on Close                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PD-GLOSSARY-8              | a verdict/signal definition named a config key (`release-warn-years`, …) with no sense of what this run set it to                                                                                     | `domain/vocab.ts#annotateThresholds` appends the run's own value beside every key name the text mentions, `"release-high-years (5 years in this run)"` — the key name stays, since that is what a reader would set; a name the run never recorded is left exactly as written                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PD-DETAIL-1                | "Follow the upstream" came fourth, after the baseline, the priority and every advisory (`report.js:737-845`)                                                                                          | it comes right after the header, before "Against the baseline": the action a reader can take is the first thing they see                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PD-DETAIL-2                | "How it is reached", "The lock entry" and "Provenance" always rendered open                                                                                                                           | each is a `<details>`, closed by default, its `<summary>` the section's own heading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PD-DETAIL-3                | `.detail` carried its own guessed sticky offset (196px) and scroll box inside `.shell-detail`'s, two nested scroll regions; a switch to another package kept the previous one's scroll position       | `.shell-detail` alone owns the geometry and the scrolling; opening a different package starts at the top                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PD-DETAIL-4                | the detail gave no sign that its own package was hidden from the current tab's list by the search box or a rail filter (the "deliberately kept" survive-a-filter behaviour, below)                    | `domain/filters.ts#hiddenByFilters` reads whether the package is in the tab's own population but excluded by `applyFilters`; when so, the header adds "Hidden by the current filters." with a "Clear filters" control (`dispatch({type:"clear"})`) — the survive-a-filter behaviour itself is unchanged; a11y/regression review: that control used to unmount itself in the same click (`hidden` turns false), dropping keyboard focus to `<body>` — it now moves focus to the panel's own Close button, which is always mounted; the note itself carried no live region either, so a reader typing a search term never heard the package had left the list — `SearchBar.tsx`'s own status line, which shares `hiddenByFilters`, now names the fact too                                                                                                                                                                                                                              |
| PD-ROWS-1                  | a Findings row drew up to three signal lines, in the finding's own signal order — a reviewer's reading, "text, text, text, no scales"                                                                 | one key-fact line: the signal with the highest level (`high` > `warn` > everything else, ties in `SIGNAL_IDS` numeric order — never the document's own order), the same `SignalLine` as before so its S-id link and title are unchanged; a muted "+N more signal(s), open the package" when more remain; the evidence sentence still stands in when a finding carries no signal at all; regression review: print drops `.shell-detail` entirely (§8), so "open the package" has nothing to open there — the other signals stay mounted under a native `hidden` attribute (`views/FindingRow.tsx`'s `.sig-rest`), and `styles/print.css` gives that one selector its display back under `@media print`, so a printed row carries every signal the finding has, not just the key fact                                                                                                                                                                                                  |
| PD-ROWS-2                  | nothing on a row showed how the years behind a signal compared with the run's own thresholds                                                                                                          | a small age scale beside the key-fact line (`domain/age.ts`): a track, a tick at the run's warn and high thresholds, and a dot at the finding's own age, from whichever of S8/S2/S4 the finding carries (independent of which signal the key-fact line shows); the dot's tone reads the zone at a glance; `null` — no S8/S2/S4 with a numeric years, or a threshold the run never recorded — draws no scale rather than guessing; stacks under the key-fact line below 760px so it never competes with the package name for width at 320px; a11y review: forced-colours mode replaces the track's, both ticks' and the dot's colour with Canvas, the page's own background, the same failure `ledger.css`'s bar segments already had — the track and ticks get an explicit `CanvasText` fill, and the dot's shape carries the zone instead of its tone (a hollow ring below warn, a dashed ring at warn..high, a filled dot at or above high, `views.css`'s own forced-colors block) |
| PD-TIMELINE-1              | the first year tick, centred like every other one, could plot left of the axis (the C2 fix keeps it even then) and lose half its own width off the edge ("24" for "2024" at 1440, gone at 390)        | clamped to the axis's own left edge and left-aligned instead of centred (`.detail-timeline-tick-first`), so it grows rightward from wherever that clamp lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| PD-TIMELINE-2              | a lane's dot was centred on the whole track, so a label that wrapped to a second line (a long branch name, or one with its php constraint on its own line) pulled the dot down between both lines     | the dot is pinned to where a single-line label's own vertical centre sits, so a wrapped label's second line grows the track without moving the dot away from the text it marks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PD-TIMELINE-3              | a package with no maintained branches (each release its own "branch", named after that same tag) showed the version twice, once bare and once with a "v" prefix ("0.0.3" then "v0.0.3")               | `domain/timeline.ts#sameVersion` compares the branch name and the tag label modulo a leading "v"; when they name the same release, the label's version is not repeated, only its date                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| PD-TIMELINE-4              | the legend always showed "branch still releasing" and "you are on …", whether or not any lane was actually in that state                                                                              | each legend entry is drawn only when a lane actually carries that state — the same `installed`/`newest` facts `laneClassName` already reads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PD-LEDGER-1                | the AdvisoryLedger read "no advisory" the same way whether the check ran and found nothing or never ran at all: `advisories.length === 0` always drew a green bar and "No advisory affects this lock" | `domain/advisories.ts#advisoryCheckIncomplete` reads the run-wide facts the schema actually carries for this check — `network_failures`, or a note naming the advisory or audit check (S9 has no per-package "did not run" signal the way S10 gives S2/S3/S4/S8); when either says so, the ledger reads "No advisory found; N packages could not be confirmed clear" in a neutral tone instead of the green all-clear, and the legend says "advisory check incomplete" in place of "no advisory affects this lock"; unchanged when the report shows neither                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PD-LEDGER-2                | a legend entry — a filter toggle — looked like plain distribution text, with no hover, focus or pressed state to say otherwise                                                                        | a pill-shaped chip (`ui/common/common.tsx#LegendButton`) with its own hover/focus/pressed styling and a `title` naming the click's effect, "Show only left-behind" / "Showing only left-behind — click to clear this filter"; a11y review: forced-colours mode flattened a pressed chip and an unpressed one to the same Canvas-on-Canvas look, and erased the swatch the same way `ledger.css`'s bar segments once did — a forced-colors block gives the pressed chip `Highlight`/`HighlightText` and the swatch an explicit system-colour fill instead                                                                                                                                                                                                                                                                                                                                                                                                                             |

Changed on purpose, and not a legacy bug:

- An advisory whose severity the page cannot bucket sorts with the unrated ones, last. The legacy
  page sorted it first, by accident of `indexOf` returning -1 (critic C1).
- The page's own pick on a wide screen is the first row the reader sees, after any filters the
  address restored; the legacy page picked the first flagged package even when a filter hid it.

Deliberately kept although odd: rail counts are per-tab totals, not faceted; the detail survives a
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

| width        | layout                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------ |
| ≥ 1181px     | rail · list · detail column (the legacy WIDE layout); the boot-time pick fills the detail  |
| 760 – 1180px | rail · list; the detail opens as a full-screen sheet                                       |
| < 760px      | one column, **list first**: a folded ledger summary, a "Filters" disclosure, then the list |

The legacy page pushed the findings below the whole ledger and the whole rail at 320px, so a phone
reader scrolled past two screens of bars and buttons before the first package. Under 760px the
ledger collapses into one line (the priority counts `SummaryBand` shows above the ledger on a wider
screen, PD-SUMMARY-1) that unfolds into the full ledger, and
the rail becomes a closed `<details>` whose summary counts the rail filters that are on. Below the
same 760px breakpoint, a Findings row's age scale stacks under its key-fact line instead of sitting
beside it, so it never competes with the package name for width at 320px (PD-ROWS-1/2).

**Sticky offsets are measured, not guessed.** Only the header band (brand, run facts, tabs) is
sticky, and only from 760px up. `Header` publishes its real height as `--topbar-h` through the
CSSOM (a ResizeObserver); the rail and the detail column stick under it and scroll on their own
when taller than the viewport. The legacy page hard-coded 196px and overlapped a wrapped header.
`.shell-detail` (`is-side`/`is-sheet`) is the only element that owns the detail's geometry and
scrolling, at every breakpoint; `Detail`'s own root only lays out its children. An earlier version
kept the legacy 196px sticky offset and a scroll box on `.detail` as well, two nested scroll
regions (PD-DETAIL-3). Opening a different package resets that scroll to the top.

**The detail panel** leads with what a reader can act on: the header, "Follow the upstream" when
there is one, then the baseline, the priority, every advisory, the release branches and the
signals. The three reference sections ("How it is reached", "The lock entry", "Provenance") come
last, each a `<details>` closed by default (PD-DETAIL-1, PD-DETAIL-2).

**Tabs** follow the ARIA tabs pattern: one tab in the Tab order, arrows/Home/End move and select,
the current view's column is the `tabpanel`. When the tab row overflows it scrolls sideways, with
edge shadows drawn by CSS alone (`background-attachment: local` over `scroll`) as the cue.

**The detail sheet** locks page scroll only while it is shown with content in it (M13). The
glossary is a native `<dialog>`; where `showModal()` throws it opens non-modal but pinned
`position: fixed` over the page with a spread-shadow backdrop, and focus is moved in and returned
by hand (M28). It opens with only "The nine verdicts" in view; the signals, libyears, priority and
"Keys and search" sections fold behind their own `<summary>` (PD-GLOSSARY-2). Opened from a verdict
pill's popover ("In the glossary"), it also scrolls to and marks that verdict's own entry, and
focuses it (PD-GLOSSARY-7).

**Keyboard** decisions are one pure function, `ui/keyboard.ts#decideKey`:

- `j`/`k` move from the open package through the rows the current view draws
  (`views/order.ts#renderedPackages`), clamped at both ends; with nothing open, or the open package
  not on screen, both start at the first row. There is no separate cursor, so a row clicked, a
  package opened from an advisory, or the boot pick is where `j` continues from (fixes M7–M9; the
  legacy first `j` after the boot pick re-selected the same package).
- Nothing but Escape acts while the glossary is open (M10). Printable shortcuts are ignored while
  focus is in any text field, and every shortcut is ignored with Ctrl, Meta or Alt held.
- Enter/Space toggle a row only when the key lands on the row itself, not on a link or control
  inside it (M5).
- A verdict pill's `docs` popover (`ui/common/common.tsx`, PD-GLOSSARY-4) and the gate fact's are
  native `popover="auto"` elements opened by a `<button popovertarget>`. They take priority over the
  glossary and the detail for Escape (below), but not for `j`/`k`/`?`, since they never trap focus.
- Escape closes one thing per press: an open popover first (left to the browser's own dismissal,
  PD-GLOSSARY-6/PD-SUMMARY-4), then the glossary, then detail (focus returns to the row whose
  `data-pkg` equals the closed package, found by attribute comparison), then the search box's focus.

**Theme.** The button names the action relative to the _effective_ theme, the pinned one or the
OS preference (M11). The choice persists under `lockrot-theme`; an unrecognised stored value is
ignored rather than written onto the page.

**The gate fact.** Beside "lockrot `<version>`" in the run-meta row, a quiet button names the run's
gate, "no gate" or "gate: `<value>`", and opens a native popover (`popover="auto"`, no script)
saying what that does and does not mean. A document from before `run.fail_on` existed shows
neither (PD-SUMMARY-2).

**Address bar.** `ui/useHashState.ts` reads the fragment once at boot, then the layout, then makes
the boot pick (never written), writes after every state change, and applies `hashchange` by
replacing the state from the new fragment while keeping the table's sort order.
