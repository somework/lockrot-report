import { test } from "vitest";

import { ageLine, ageNotRead } from "../../../src/domain/ageLine";
import { expectGolden } from "./golden";

test("the Age row of every recorded case", async () => {
  await expectGolden("age", ({ finding, metadata }) => ({
    line: ageLine(finding, metadata),
    not_read: ageNotRead(finding, metadata).join(" · "),
  }));
});
