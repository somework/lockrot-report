import { useReport } from "../context";
import { AdvisoriesView2 } from "../report/AdvisoriesView";
import { OverviewView2 } from "../report/OverviewView";
import { FindingsView2 } from "../report/FindingsView";
import { PackagesView2 } from "../report/PackagesView";
import { RadiusView2 } from "../report/RadiusView";
import { RunView2 } from "../report/RunView";

/**
 * The current tab's body. `state.view` is typed as one of the known views end to end (an
 * unrecognised `view=` in the URL fragment is `state/hash.ts`'s to resolve, by rule R1), so every
 * case below is reachable and the switch needs no default.
 */
export function CurrentView() {
  const { state } = useReport();

  switch (state.view) {
    case "overview":
      return <OverviewView2 />;
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
