import { test } from "vitest";

import { checksLine } from "../../../src/domain/checksLine";
import { expectGolden } from "./golden";

test("the checks line of every recorded case", async () => {
  await expectGolden("checks", ({ finding, run }) => checksLine(finding, run));
});
