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
    radius.ts             blast-radius cards
    sniff.ts              the two places the page reads PHP-rendered text (isolated, tested)
  state/
    state.ts              State, Action, reducer
    hash.ts               parse/serialise the fragment (format unchanged, see §4)
  ui/                     Preact components, one folder per surface, CSS next to the component
  styles/                 tokens.css, base.css, print.css
tests/unit/               vitest, mirrors src/
e2e/                      Playwright; runs against the legacy page AND the new one (§6)
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

Fixed on purpose (the e2e suite marks each as a known legacy difference):

| id       | legacy                                                                                     | new                                                                                         |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| M1       | severity is compared raw; `moderate`/`High` get no ledger bucket and sort first            | case-insensitive; `moderate` → medium; anything else → unrated bucket, raw text still shown |
| M2       | S10 has no name, sorts between S1 and S2, absent from the glossary                         | S10 named "a check could not run", numeric id order                                         |
| M5       | Enter on a link inside a row toggles the detail                                            | the link is followed                                                                        |
| M6       | package-table rows are not focusable and show no selection                                 | focusable, `aria-selected`                                                                  |
| M7/M8/M9 | `j`/`k` walk the document order, not the rows on screen, and can open packages with no row | walk the rendered rows of the current view                                                  |
| M10      | `j`/`k` act behind the open glossary                                                       | ignored while a dialog is open                                                              |
| M11      | first click on the theme button does nothing under an OS dark preference                   | the button always reflects the effective theme                                              |
| M12      | a bad `%` escape in the fragment blanks the page                                           | the piece is skipped                                                                        |
| M13      | an unknown `pkg=` on a narrow screen locks scrolling                                       | the detail says the package is not in this report                                           |
| M17      | ledger filter buttons carry no pressed state for assistive tech                            | `aria-pressed`                                                                              |
| M19      | every healthy package counts as "Already accepted"                                         | only flagged findings the baseline knows                                                    |
| M20      | a clean report says "Nothing matches this filter"                                          | it says nothing was flagged                                                                 |
| M21      | "1 of 1 flagged packages"                                                                  | singular forms                                                                              |
| M24/M25  | radius card count disagrees with the rows it lists                                         | the count is the rows listed; a flagged parent says so                                      |
| M26      | timeline label pairs the highest version with another tag's date                           | label and date come from the same tag                                                       |
| M28      | glossary fallback renders below the footer                                                 | fixed-position overlay                                                                      |
| M29      | ledger tooltip says "except ok and finished" but also excludes unknown                     | text matches the count                                                                      |
| C2       | first year tick on the timeline is always dropped                                          | kept                                                                                        |
| WIDE     | measured once at boot                                                                      | follows `matchMedia` changes                                                                |

Deliberately kept although odd: rail counts are per-tab totals, not faceted; the detail survives a
filter that hides its package; `data-goto` keeps the detail open.

## 6. Testing

- **Unit** (vitest): every `domain/` and `state/` module, `model/normalize` over every fixture. The
  legacy `lib.test.js` cases are ported verbatim as the first tests of `format`, `links`, `install`,
  `query` and `libyears`.
- **Components** (vitest + happy-dom + @testing-library/preact): the parts with logic in them —
  detail panel sections, timeline, ledger.
- **E2E** (Playwright, Chromium; Firefox and WebKit in CI): one behavioural suite, parameterised by
  `RENDERER=legacy|new`. It is written and made green against the legacy page first, which proves
  the tests test something; the new page must then pass the same suite. Legacy bugs fixed on purpose
  are `test.fail(renderer === 'legacy')`. New-only checks: axe (no serious or critical violations),
  zero CSP violations, both colour schemes, 320/768/1024/1440.
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
