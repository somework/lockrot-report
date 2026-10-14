// One file snapshot per string class under goldens/en/, an object keyed by case. `npm run goldens`
// rewrites them, and the diff is reviewed like any other.
import { expect } from "vitest";

import type { RecordedCase } from "../words/recorded";
import { recordedCases } from "../words/recorded";

export async function expectGolden(stringClass: string, line: (recorded: RecordedCase) => unknown): Promise<void> {
  const lines = Object.fromEntries(recordedCases().map((recorded) => [recorded.name, line(recorded)]));

  await expect(`${JSON.stringify(lines, null, 2)}\n`).toMatchFileSnapshot(`../../../goldens/en/${stringClass}.json`);
}
