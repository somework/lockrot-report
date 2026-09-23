import type { Model } from "../model/types";

/**
 * Placeholder root component. A later wave replaces this with the real findings/advisories/
 * packages/radius/run views DESIGN.md §3 describes; this exists only so `main.ts`, the Vite build
 * and the `mount()` lifecycle all have something real to render end to end before that wave lands.
 */
export function App({ model }: { model: Model }) {
  return (
    <main>
      <h1>lockrot</h1>
      <p>{model.report.findings.length} findings</p>
    </main>
  );
}
