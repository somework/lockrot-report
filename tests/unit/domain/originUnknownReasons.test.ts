import { describe, expect, it } from "vitest";
import { ageRows } from "../../../src/domain/ageRows";
import { installedAge, libyearsCell } from "../../../src/domain/packageCells";
import type { Finding, Report2 } from "../../../src/model/report";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;
const base = composite.findings.find((f) => f.package === "twig/twig") as Finding;

const notFromRepository = (kind: string): Finding => ({
  ...base,
  origin: { ...base.origin, kind },
  libyears: null,
  libyears_unmeasured: "not_from_composer_repository",
  age: {
    ...base.age,
    installed: null,
    installed_unmeasured: "not_from_composer_repository",
    release: null,
    release_unmeasured: "not_from_composer_repository",
    branch_release: null,
    branch_release_unmeasured: "not_from_composer_repository",
  },
});

describe("ruling R12-8: an unmeasured reason of a finding of unknown origin reads as the check reasons do", () => {
  const unknown = notFromRepository("unknown");

  it("words the libyears and installed age cells 'origin unknown'", () => {
    expect(libyearsCell(unknown).label).toBe("origin unknown");
    expect(installedAge(unknown).label).toBe("origin unknown");
  });

  it("words every age row 'origin unknown'", () => {
    const values = ageRows(unknown, null).map((row) => row.value);
    expect(values).toEqual(
      expect.arrayContaining([
        `${base.version} · release date not known (origin unknown)`,
        "installed not read (origin unknown)",
        `${base.branch ?? "its branch"} not read (origin unknown)`,
        "most recent not read (origin unknown)",
      ]),
    );
    expect(values.filter((value) => value.includes("Composer repository"))).toEqual([]);
  });

  it("keeps the repository words for a known origin that no Composer repository serves", () => {
    const path = notFromRepository("path");
    expect(libyearsCell(path).label).toBe("not from a Composer repository");
    expect(ageRows(path, null).map((row) => row.value)).toContain(
      "most recent not read (not from a Composer repository)",
    );
  });
});
