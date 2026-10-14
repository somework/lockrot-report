import { test } from "vitest";

import { repositoryLine } from "../../../src/domain/repositoryLine";
import { expectGolden } from "./golden";

test("the repository line of every recorded case", async () => {
  await expectGolden("repository", ({ finding }) => repositoryLine(finding));
});
