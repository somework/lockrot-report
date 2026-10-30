# Contributing

Node 26 (`.nvmrc`). Everything below is an npm script:

| command                                                                                   | what it does                                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm ci`                                                                                  | install exactly what `package-lock.json` pins                    |
| `npm run contract:fetch`                                                                  | get lockrot's recorded bundle into `.lockrot/`, before the tests |
| `npm run build`                                                                           | typecheck, bundle, and assemble `dist/`                          |
| `npm test`                                                                                | unit and component tests (vitest), and the coverage gate         |
| `npm run test:e2e`                                                                        | the browser suite (Playwright); needs `build/pages/`, see below  |
| `npm run lint`, `npm run typecheck`, `npm run typecheck:contract`, `npm run format:check` | what CI runs before the tests, after `contract:fetch`            |

## lockrot's contract

`npm test` and `npm run typecheck:contract` read lockrot's recorded bundle at the commit
`contract/lockrot.json` pins. Run `npm run contract:fetch` once before them, and again after the pin
moves. It needs no network when `.lockrot/` holds the pinned commit unchanged. DESIGN.md §7 says
how to re-pin.

## Coverage

`npm test` measures the coverage of `src/` and fails below the floors in `vitest.config.ts`. A floor
holds the measured value of its folder. Raise it when a change lifts the folder, and never lower it.
CSS counts toward no number (`css: false`), so the browser suite carries the layout rules.
The floors hold for the whole suite only, so run one file with `npx vitest run <file>`.

## The browser suite

`e2e/` describes the page's behaviour through a page object, and runs against the built page:

```sh
npx playwright install chromium
npm run contract:fetch                       # the report-2 pages are built from lockrot's bundle
npm run build && node scripts/pages.mjs      # dist/report.html filled with every fixture → build/pages/
npx playwright test
```

The suite was written and made green against `legacy/` (lockrot's hand-written page, at the commit
in `legacy/SOURCE_COMMIT`) first, while the renderer was being extracted — proof the tests test
something — and ran against both pages until lockrot 0.12.0 stopped shipping the legacy one. A
behaviour the new page changed on purpose during that extraction is listed in DESIGN.md §5, with the
test that covers it carrying the row's id in a comment; later deliberate differences are recorded
there the same way.

When a test fails, fix the page. Change a test only when it is wrong about DESIGN.md, and say why
in the commit.

Several tests hold the page to a space budget (lines, row heights) in the browser's own fonts, and
CI's Linux fonts are wider than macOS's. To run the suite the way CI does, use the Playwright image
with the font CI installs; the named volume keeps your host `node_modules` intact, so rebuild the
pages on the host afterwards:

```sh
docker run --rm -v "$PWD":/work -v lockrot-report-nm:/work/node_modules -w /work --ipc=host \
  mcr.microsoft.com/playwright:v1.63.0-noble bash -lc \
  "apt-get update -qq && apt-get install -y -qq fonts-dejavu-core >/dev/null \
   && npm ci && npm run build && node scripts/pages.mjs && CI=1 npx playwright test"
```

`node scripts/shoot.mjs build/pages build/shots/new` screenshots every page at 320, 768, 1024 and
1440 px in both colour schemes — a review aid, not a gate.

## Rules the code keeps

- Markup comes from JSX and nowhere else. `innerHTML`, `outerHTML`, `insertAdjacentHTML` and
  `dangerouslySetInnerHTML` are lint errors.
- No `style="…"` in markup: the page's CSP would refuse it. A dynamic number goes through the `style`
  object prop; everything else is a class.
- Nothing is fetched. A test fails on `fetch(`, `XMLHttpRequest`, `@import` or `import(` in the page.
- Rules live in `src/domain/` as pure functions with tests; components render what those return.
- `src/model/normalize.ts` is the one place that reads the raw document. The page reads report-2
  only, and a report-1 document stops there, at the report-1 screen.
- `src/template.html` is excluded from prettier: consumers match its tags byte for byte.

## Fixtures

The report-2 test data is lockrot's recorded bundle at the pinned commit: `npm run contract:fetch`
gets it into `.lockrot/`, and `scripts/report2-embed.ts` assembles each case's page data from it.
`fixtures/bundles/mini.json` is the one report-1 document the repository keeps, as the input of
the report-1 screen.

## Releasing

1. Move the `Unreleased` section of CHANGELOG.md under the new version, and set `version` in
   `package.json` to the same number.
2. Pick the pin. A pre-release pins the lockrot commit that changes the contract bundle. A final
   tag pins the lockrot commit V that vendors an rc of the same bundle. Lockrot's main or a lockrot
   tag must hold the pin: `node scripts/contract.mjs reachable` says whether it does. For a final
   tag, a lockrot tag holds V, and a push of V unchanged to `release/full-check-<sha of V>` has a
   green full check of the whole tree. A full check that an rc tag starts does not count, because
   its branch is the tag. The release workflow also accepts a green CI run of a push to lockrot's
   main.
3. Run `node scripts/contract.mjs repin <pin>`. For a final tag, commit only the version and the pin:
   `package.json`, the CHANGELOG heading and `contract/lockrot.json`. If `repin` changed another
   file under `contract/`, V does not vendor the same bundle, so stop. Merge the commit into main for
   a final tag, or into its release branch for a pre-release.
4. Before the first final tag, list the rulesets with `gh api repos/somework/lockrot-report/rulesets`.
   The list leaves out each ruleset's conditions and rules, so read each one with
   `gh api repos/somework/lockrot-report/rulesets/<id>`. Confirm that a tag ruleset on
   `refs/tags/v*` has the `deletion` and `update` rules. If it is missing, create it. A moved tag
   gets a second attestation, and lockrot's `update-renderer` then cannot name one source commit.
   Then tag `vX.Y.Z` on main, or tag a pre-release on main or its release branch. The release
   workflow refuses a final tag that main does not hold, and a pre-release tag that neither main
   nor a release branch holds. It also refuses a pin that the check of step 2 refuses, and a final
   tag whose pin has no green lockrot run. A pre-release needs no such run, because lockrot's
   renderer test fails on its pin until lockrot vendors it. The workflow runs the gates of ci.yml,
   then builds, attests and publishes.
5. In lockrot, run `tools/report/update-renderer vX.Y.Z` and open a pull request.
