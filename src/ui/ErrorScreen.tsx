import type { NormalizeError } from "../model/types";
import { ScreenFrame } from "./ScreenFrame";

/** A report-1 document has its own screen (`Report1Screen`). */
type ScreenError = Exclude<NormalizeError, { kind: "report-1" }>;

/**
 * What each `NormalizeError.kind` means to someone who is not lockrot's own code. DESIGN.md §1.2: "a
 * payload that is not JSON, or not a lockrot document, renders an explained error in place of the
 * report — never a blank page."
 */
const EXPLANATIONS: Readonly<Record<ScreenError["kind"], string>> = {
  "not-json": "The data this page was given is not valid JSON, so nothing in it could be parsed.",
  "not-a-report":
    "The data parsed, but it is not shaped like a lockrot report: it has none of the fields " +
    '(a "report" object with its findings) this page expects.',
  "malformed-report":
    "The data names report schema 2, but it is not a whole report-2 document, so the page cannot " +
    "trust what it would draw from it.",
  "render-failed":
    "The report was read, but part of it broke while the page drew it, so the page shows this " +
    "instead of a half-drawn report.",
};

/**
 * Rendered in place of the report whenever the model rejects the payload or the page throws while
 * drawing it. `error.message` renders as text, never markup, so a hostile payload cannot use its own
 * error message to inject anything.
 */
export function ErrorScreen({ error }: { error: ScreenError }) {
  return (
    <ScreenFrame headingId="error-heading">
      <h1 id="error-heading">This report could not be rendered</h1>
      <p className="screen-lead">{EXPLANATIONS[error.kind]}</p>
      <p className="screen-detail">
        <span className="screen-label">Reported reason:</span> {error.message}
      </p>
      <p className="screen-detail">
        Nothing was sent anywhere over this: the page loads no network resource, and the data it was given is
        still sitting, untouched, in the <code>#lockrot-data</code> element it was read from. If this page was
        produced by <code>composer lockrot --format=html</code>, check that the file was not truncated or
        hand-edited before it reached this browser.
      </p>
    </ScreenFrame>
  );
}
