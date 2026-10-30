import { test } from "vitest";

import { BLOCK_KEYS, blockGolden } from "../blocks/blockGoldens";
import { expectGolden } from "./golden";

test.each(BLOCK_KEYS)("the %s block of every recorded case", async (key) => {
  await expectGolden(key.replaceAll("_", "-"), ({ finding, run, metadata }) => blockGolden(key, finding, run, metadata));
});
