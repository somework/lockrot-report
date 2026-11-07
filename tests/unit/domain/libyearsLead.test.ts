import { describe, expect, test } from "vitest";

import { libyearsLead } from "../../../src/domain/libyearsLead";
import type { Report2 } from "../../../src/model/report";

const libyears = (unmeasured: Record<string, number>): Pick<Report2, "libyears"> => ({
  libyears: {
    total: null,
    direct_requirements: null,
    measured: 0,
    at_least_count: 0,
    unmeasured: unmeasured as Report2["libyears"]["unmeasured"],
    furthest_behind: null,
    packages: 3,
  },
});

describe("the Not measured clause of the Libyears lead", () => {
  test("lists parent_split in the schema's key order, after shared_commit and before undated", () => {
    const lead = libyearsLead(libyears({ undated: 1, parent_split: 2, shared_commit: 3 }));

    expect(lead.unmeasured).toBe(
      "Not measured: 3, dated only by a commit its tags share · 2, a split whose parent dates its newest release · 1, no date",
    );
  });
});
