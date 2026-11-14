import { test } from "vitest";

import { plain } from "../../../src/domain/rich";
import { moveCheckFact } from "../../../src/domain/runTab";
import { expectGolden } from "./golden";

test("the Run tab's move check line of every recorded case", async () => {
  await expectGolden("move-check", ({ report }) => {
    const fact = moveCheckFact(report);
    return fact === null ? null : plain(fact);
  });
});
