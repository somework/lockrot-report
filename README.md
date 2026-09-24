# lockrot-report

The page [lockrot](https://github.com/somework/lockrot) writes with `--format=html`: one
self-contained file per run that opens from `file://`, downloads from CI as a single artifact and
attaches to a ticket. It loads nothing from the network, and it runs under a Content-Security-Policy
that says so.

This repository is the renderer only. What goes into the page — which packages, which facts, which
verdicts — is decided by lockrot and arrives as JSON; this code draws it.

## What a release contains

| file                                      | used by                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `report.html`                             | lockrot, which fills `{{TITLE}}`, `{{DESCRIPTION}}` and `{{DATA}}`       |
| `lockrot-report.js`, `lockrot-report.css` | pages that embed a report, such as a viewer                              |
| `manifest.json`                           | whoever vendors a release: version, sha256 of every file, the CSP hashes |

Every file is attested by GitHub Actions. Check a download before you use it:

```sh
gh attestation verify report.html --repo somework/lockrot-report
```

## Embedding

```html
<link rel="stylesheet" href="lockrot-report.css" />
<div id="report"></div>
<script src="lockrot-report.js"></script>
<script>
  const page = LockrotReport.mount(document.getElementById("report"), bundle);
  // later: page.update(otherBundle); page.unmount();
</script>
```

`bundle` is lockrot's `--format=html` payload (`{report, details}`) or a bare `--format=json`
document. A page that carries `<script id="lockrot-data" type="application/json">` with a payload
and a `<div id="lockrot-app">` renders itself when the script loads.

## Publishing a report

A site that republishes a report someone else ran should say so above it. The page's policy
refuses inline styles, so put the line in a `lockrot-provenance` element right after `<body>`; the
page styles it in both themes:

```html
<body>
  <div class="lockrot-provenance">This report was produced by … on …, reading …</div>
</body>
```

A publisher that adds a script or a stylesheet of its own has to replace the page's
Content-Security-Policy; `manifest.json` carries the hashes it pins.

## Compatibility

The renderer reads report schema 1 and every document lockrot has written with it, back to 0.10.0.
A field it does not know is ignored; a verdict, signal or severity it does not know is shown as
written. The placeholders, the payload tag and the address format (`#view=…&q=…&pkg=…`) are part of
the public interface; a release that changes them says so under **Breaking** in the changelog.

A release is numbered after the lockrot release that first ships it.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) and [DESIGN.md](DESIGN.md).

## License

MIT
