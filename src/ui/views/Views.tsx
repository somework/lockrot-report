import { useReport } from "../context";
import { AdvisoriesView2 } from "../report2/AdvisoriesView2";
import { FindingsView2 } from "../report2/FindingsView2";
import { PackagesView2 } from "../report2/PackagesView2";
import { RadiusView2 } from "../report2/RadiusView2";
import { RunView2 } from "../report2/RunView2";

/**
 * The current tab's body. `state.view` is typed as one of the five known views end to end (parsing
 * an unrecognised `view=` out of the URL fragment is `state/hash.ts`'s job, and it already falls
 * back to `"findings"` there), so every case below is reachable and the switch needs no default.
 */
export function CurrentView() {
  const { state } = useReport();

  switch (state.view) {
    case "findings":
      return <FindingsView2 />;
    case "advisories":
      return <AdvisoriesView2 />;
    case "packages":
      return <PackagesView2 />;
    case "radius":
      return <RadiusView2 />;
    case "run":
      return <RunView2 />;
  }
}
