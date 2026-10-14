import { test } from "vitest";

import { answerText } from "../../../src/domain/findingAnswer";
import { expectGolden } from "./golden";

test("the answer of every recorded case", async () => {
  await expectGolden("answer", ({ finding, run }) => answerText(finding, run));
});
