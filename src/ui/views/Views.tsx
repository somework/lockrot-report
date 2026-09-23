import { useReport } from "../context";
import { FindingsView } from "./FindingsView";
import { AdvisoriesView } from "./AdvisoriesView";
import { PackagesView } from "./PackagesView";
import { RadiusView } from "./RadiusView";
import { RunView } from "./RunView";

/**
 * The current tab's body. `state.view` is typed as one of the five known views end to end (parsing
 * an unrecognised `view=` out of the URL fragment is `state/hash.ts`'s job, and it already falls
 * back to `"findings"` there), so every case below is reachable and the switch needs no default.
 */
export function CurrentView() {
  const { state } = useReport();

  switch (state.view) {
    case "findings":
      return <FindingsView />;
    case "advisories":
      return <AdvisoriesView />;
    case "packages":
      return <PackagesView />;
    case "radius":
      return <RadiusView />;
    case "run":
      return <RunView />;
  }
}
