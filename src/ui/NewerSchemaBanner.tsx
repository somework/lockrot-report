import { useReport } from "./context";

/** The report schema major this renderer was written against (DESIGN.md §2). */
const READS_SCHEMA = 1;

/**
 * Shown when the document declares a newer report schema than this renderer reads (DESIGN.md §2).
 * The page still renders everything it recognises; this says why something may be missing, so a
 * reader does not take an absent section for an absent problem. Deliberately not a live region:
 * it is there from the first paint and never changes.
 */
export function NewerSchemaBanner({ inert = false }: { inert?: boolean }) {
  const { model } = useReport();
  if (!model.newerSchema) return null;

  return (
    <div className="schema-banner" inert={inert}>
      <p>
        <b>This report is newer than this page.</b> It was written with report schema{" "}
        <span className="mono">{model.schema}</span>, and this page reads schema{" "}
        <span className="mono">{READS_SCHEMA}</span>. What it recognises is shown below; anything the newer
        lockrot added is left out.
      </p>
    </div>
  );
}
