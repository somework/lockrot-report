import type { NormalizeError } from "../model/types";

/**
 * What each `NormalizeError.kind` means to someone who is not lockrot's own code: this is the only
 * place that turns the two internal reasons a payload cannot be normalised into sentences a reader
 * opening the page can act on. DESIGN.md §1.2: "a payload that is not JSON, or not a lockrot
 * document, renders an explained error in place of the report — never a blank page."
 */
const EXPLANATIONS: Readonly<Record<NormalizeError["kind"], string>> = {
  "not-json": "The data this page was given is not valid JSON, so nothing in it could be parsed.",
  "not-a-report":
    "The data parsed, but it is not shaped like a lockrot report: it has none of the fields " +
    '(a "report" object with its findings) this page expects.',
};

/**
 * Rendered in place of the report whenever `normalize()`/`parseBundle()` returns `{ok: false}`.
 * Every value here is either a fixed string or `error.message`, which JSX escapes as text — never
 * markup — so a hostile or merely malformed payload cannot use its own error message to inject
 * anything into the page it failed to render.
 */
export function ErrorScreen({ error }: { error: NormalizeError }) {
  return (
    <main className="error-screen" aria-labelledby="error-heading">
      <h1 id="error-heading">This report could not be rendered</h1>
      <p>{EXPLANATIONS[error.kind]}</p>
      <p className="error-screen-detail">
        <span className="error-screen-label">Reported reason:</span> {error.message}
      </p>
      <p className="error-screen-hint">
        Nothing was sent anywhere over this: the page loads no network resource, and the data it was given is
        still sitting, untouched, in the <code>#lockrot-data</code> element it was read from. If this page was
        produced by <code>composer lockrot --format=html</code>, check that the file was not truncated or
        hand-edited before it reached this browser.
      </p>
    </main>
  );
}
