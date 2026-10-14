import { test } from "vitest";

import { branchesLine } from "../../../src/domain/branchesLine";
import { expectGolden } from "./golden";

test("the branches line of every recorded case", async () => {
  await expectGolden("branches", ({ finding, metadata }) => branchesLine(finding, metadata));
});
