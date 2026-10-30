import { HTML_COMMAND } from "./Footer";
import { ScreenFrame } from "./ScreenFrame";

const OLDER_RELEASE = "https://github.com/somework/lockrot-report/releases/tag/v0.13.0";

/** Shown in place of a report-1 document: renderer 0.14 reads report-2 only, and derives nothing
 *  from an older document (SPEC §7.9.17, PD-SCHEMA-1). `version` is the document's `lockrot.version`. */
export function Report1Screen({ version }: { version: string | null }) {
  const writer = version === null ? "an older lockrot" : `lockrot ${version}`;
  return (
    <ScreenFrame
      headingId="report1-heading"
      banner={
        <>
          <b>This report is older than this page.</b> It was written by {writer}, in report schema 1.
        </>
      }
    >
      <h1 id="report1-heading">This page reads lockrot 0.14 reports only</h1>
      <p className="screen-lead">
        The report was written by {writer}. lockrot 0.14 grades each package by a score, and this page draws
        that score. It does not guess one for an older report.
      </p>
      <div className="screen-ways">
        <section className="screen-card" aria-labelledby="report1-rerun">
          <h2 id="report1-rerun">Rerun lockrot 0.14</h2>
          <p>In the project, update lockrot and run it again:</p>
          <pre>
            <code>composer require --dev somework/lockrot</code>
            {"\n"}
            <code>{HTML_COMMAND}</code>
          </pre>
        </section>
        <section className="screen-card" aria-labelledby="report1-older">
          <h2 id="report1-older">Open it with lockrot-report 0.13</h2>
          <p>
            The 0.13 page reads this report as it was written.{" "}
            <a href={OLDER_RELEASE} target="_blank" rel="noopener noreferrer">
              lockrot-report v0.13.0
            </a>
          </p>
        </section>
      </div>
    </ScreenFrame>
  );
}
