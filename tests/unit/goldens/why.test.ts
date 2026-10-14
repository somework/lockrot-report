import { test } from "vitest";

import { whyLines } from "../../../src/domain/scoreWhy";
import { expectGolden } from "./golden";

test("the Why lines of every recorded case", async () => {
  await expectGolden("why", ({ finding, report }) => whyLines(finding, report));
});
