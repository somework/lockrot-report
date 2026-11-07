import { describe, expect, it } from "vitest";

import { pageTitle, projectName } from "../../../src/domain/pageTitle";

describe("pageTitle", () => {
  it("leads with the tab and the project, then keeps the title the page was written with", () => {
    expect(pageTitle("lockrot: 3 of 9 packages flagged", "Findings", "acme/app", null)).toBe(
      "Findings · acme/app · lockrot: 3 of 9 packages flagged",
    );
  });

  it("leads with the open package", () => {
    expect(pageTitle("lockrot: 3 of 9 packages flagged", "Findings", "acme/app", "twig/twig")).toBe(
      "twig/twig · Findings · acme/app · lockrot: 3 of 9 packages flagged",
    );
  });

  it("drops a blank title, as an embedder's page may have", () => {
    expect(pageTitle("  ", "Overview", "acme/app", null)).toBe("Overview · acme/app");
  });
});

describe("projectName", () => {
  it("names the project, else the lock file, else composer.lock", () => {
    expect(projectName({ project: "acme/app", lock_file: "x/composer.lock" })).toBe("acme/app");
    expect(projectName({ project: null, lock_file: "x/composer.lock" })).toBe("x/composer.lock");
    expect(projectName({ project: null, lock_file: null })).toBe("composer.lock");
  });
});
