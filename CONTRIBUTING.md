# Contributing

Node 24 (`.nvmrc`). Everything below is an npm script:

| command                                                     | what it does                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `npm ci`                                                    | install exactly what `package-lock.json` pins                   |
| `npm run build`                                             | typecheck, bundle, and assemble `dist/`                         |
| `npm test`                                                  | unit and component tests (vitest)                               |
| `npm run test:e2e`                                          | the browser suite (Playwright); needs `build/pages/`, see below |
| `npm run lint`, `npm run typecheck`, `npm run format:check` | what CI runs first                                              |

## The browser suite

`e2e/` describes the page's behaviour through a page object, and runs against the built page:

```sh
npx playwright install chromium
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

`node scripts/shoot.mjs build/pages build/shots/new` screenshots every page at 320, 768, 1024 and
1440 px in both colour schemes — a review aid, not a gate.

## Rules the code keeps

- Markup comes from JSX and nowhere else. `innerHTML`, `outerHTML`, `insertAdjacentHTML` and
  `dangerouslySetInnerHTML` are lint errors.
- No `style="…"` in markup: the page's CSP would refuse it. A dynamic number goes through the `style`
  object prop; everything else is a class.
- Nothing is fetched. A test fails on `fetch(`, `XMLHttpRequest`, `@import` or `import(` in the page.
- Rules live in `src/domain/` as pure functions with tests; components render what those return.
- `src/model/normalize.ts` is the one place that knows older document shapes.
- `src/template.html` is excluded from prettier: consumers match its tags byte for byte.

## Fixtures

`fixtures/bundles/` holds real payloads written by lockrot. To add one, run lockrot with
`--format=html` and cut the payload out of the page:

```sh
sed -n 's/.*<script id="lockrot-data" type="application\/json">\(.*\)<\/script>.*/\1/p' report.html > fixtures/bundles/name.json
```

## Releasing

1. Move the `Unreleased` section of CHANGELOG.md under the new version, and set `version` in
   `package.json` to the same number.
2. Merge, then tag `vX.Y.Z` on main. The release workflow builds, attests and publishes.
3. In lockrot, run `tools/report/update-renderer vX.Y.Z` and open a pull request.
