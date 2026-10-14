import { test } from "vitest";

import { securityLine } from "../../../src/domain/securityLine";
import { expectGolden } from "./golden";

test("the security line of every recorded case", async () => {
  await expectGolden("security", ({ finding, run, metadata }) => securityLine(finding, run, metadata));
});
