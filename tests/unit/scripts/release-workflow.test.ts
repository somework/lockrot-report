import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const WORKFLOW = readFileSync(join(process.cwd(), ".github", "workflows", "release.yml"), "utf8");

/** Each job's text, by job id: the lines from `  {id}:` under `jobs:` to the next job. */
function jobs(): Map<string, string> {
  const body = WORKFLOW.slice(WORKFLOW.indexOf("\njobs:\n"));
  const parts = body.split(/^ {2}([\w-]+):\n/m).slice(1);
  const found = new Map<string, string>();
  for (let at = 0; at < parts.length; at += 2) found.set(parts[at] ?? "", parts[at + 1] ?? "");
  return found;
}

const runsCode = (job: string): boolean => /\b(npm|npx|node)\b/.test(job) || job.includes("actions/checkout");
const holdsWrite = (job: string): boolean => /: write\b|write-all/.test(job);

test("the workflow grants nothing beyond read at its top", () => {
  const top = WORKFLOW.slice(0, WORKFLOW.indexOf("\njobs:\n"));

  expect(top).toMatch(/^permissions:\n {2}contents: read$/m);
  expect(holdsWrite(top)).toBe(false);
});

test("no job that installs or runs the repository's code holds a write token or id-token (R4-23)", () => {
  const coded = [...jobs()].filter(([, job]) => runsCode(job));

  expect(coded.length).toBeGreaterThan(0);
  expect(coded.filter(([, job]) => holdsWrite(job)).map(([id]) => id)).toEqual([]);
});

test("the job that attests and publishes runs no repository code and keeps no checkout credentials", () => {
  const publishing = [...jobs()].filter(([, job]) => job.includes("attest-build-provenance"));

  expect(publishing.map(([, job]) => [runsCode(job), holdsWrite(job)])).toEqual([[false, true]]);
  expect(WORKFLOW).not.toMatch(/persist-credentials: true/);
  expect(WORKFLOW.match(/actions\/checkout@/g)?.length).toBe(
    WORKFLOW.match(/persist-credentials: false/g)?.length,
  );
});
