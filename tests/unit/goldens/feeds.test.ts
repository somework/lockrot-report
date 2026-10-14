import { test } from "vitest";

import { feedsLine } from "../../../src/domain/feedsLine";
import { expectGolden } from "./golden";

test("the feeds line of every recorded case", async () => {
  await expectGolden("feeds", ({ finding }) => feedsLine(finding));
});
