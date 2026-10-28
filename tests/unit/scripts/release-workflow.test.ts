import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const GIT_ID = {
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

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

test("the published files come from a build that ran no install script, and match the gates' own build", () => {
  const all = jobs();
  const builders = [...all].filter(([, job]) => /upload-artifact[\s\S]*name: release\n/.test(job));
  const publish = [...all].find(([, job]) => job.includes("attest-build-provenance"))?.[1] ?? "";

  expect(builders.map(([, job]) => /npm ci --ignore-scripts/.test(job))).toEqual([true]);
  expect(publish).toMatch(/sha256sum --check/);
  expect(publish.indexOf("sha256sum --check")).toBeLessThan(publish.indexOf("attest-build-provenance"));
});

/** The shell of the gates step named `name`, as the runner gets it. */
function stepScript(name: string): string {
  const gates = jobs().get("gates") ?? "";
  const at = gates.indexOf(`- name: ${name}\n`);
  if (at === -1) throw new Error(`the gates job has no step "${name}"`);
  const step = gates.slice(at).split(/\n {6}- /)[0] ?? "";
  const run = step.slice(step.indexOf("run: |\n") + "run: |\n".length);
  return run
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

function sh(script: string, cwd: string, env: Record<string, string> = {}): { status: number; out: string } {
  const result = spawnSync("bash", ["-eo", "pipefail", "-c", script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { status: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

describe("a tag publishes only from a commit its channel allows (R6-29)", () => {
  const BRANCH_STEP = "a final tag is on main, and a pre-release on main or a release branch";
  let repo = "";
  const commit: Record<string, string> = {};

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "release-branch-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, ...GIT_ID } }).trim();
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "on main");
    commit["main"] = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "release/0.14.0");
    git("commit", "-q", "--allow-empty", "-m", "on the release branch");
    commit["release"] = git("rev-parse", "HEAD");
    git("checkout", "-q", "--orphan", "elsewhere");
    git("commit", "-q", "--allow-empty", "-m", "on no reviewed branch");
    commit["elsewhere"] = git("rev-parse", "HEAD");
    for (const branch of ["main", "release/0.14.0"])
      git("update-ref", `refs/remotes/origin/${branch}`, branch);
  });
  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test.each([
    ["v0.14.0", "main", 0],
    ["v0.14.0", "release", 1],
    ["v0.14.0", "elsewhere", 1],
    ["v0.14.0-rc.7", "main", 0],
    ["v0.14.0-rc.7", "release", 0],
    ["v0.14.0-rc.7", "elsewhere", 1],
  ])("%s on the %s commit exits %i", (tag, on, status) => {
    const result = sh(stepScript(BRANCH_STEP), repo, { GITHUB_SHA: commit[on] ?? "", GITHUB_REF_NAME: tag });
    expect({ status: result.status, out: result.out }).toMatchObject({ status });
  });
});

describe("the lockrot pin has a green lockrot run (R6-29, decision 35)", () => {
  const RUN_STEP = "lockrot's gates passed on the pinned commit";
  let bin = "";

  function withRuns(runs: unknown): { status: number; out: string } {
    writeFileSync(join(bin, "runs.json"), JSON.stringify(runs));
    return sh(stepScript(RUN_STEP), process.cwd(), { PATH: `${bin}:${process.env["PATH"] ?? ""}` });
  }

  beforeAll(() => {
    bin = mkdtempSync(join(tmpdir(), "release-gh-"));
    // The fake gh answers `gh run list` with runs.json and records its arguments.
    writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$@" > "${bin}/args"\ncat "${bin}/runs.json"\n`, {
      mode: 0o755,
    });
  });
  afterAll(() => {
    rmSync(bin, { recursive: true, force: true });
  });

  test("asks lockrot's successful push runs of the pinned commit", () => {
    withRuns([]);
    const pin = (
      JSON.parse(readFileSync(join(process.cwd(), "contract", "lockrot.json"), "utf8")) as { commit: string }
    ).commit;
    const args = readFileSync(join(bin, "args"), "utf8");
    expect(args).toContain("--repo somework/lockrot");
    expect(args).toContain(`--commit ${pin}`);
    expect(args).toContain("--event push");
    expect(args).toContain("--status success");
  });

  test.each([
    ["a full check", [{ workflowName: "full-check", headBranch: "release/full-check-97e3121d" }], 0],
    [
      "a full check of some shards only",
      [{ workflowName: "full-check", headBranch: "release/full-check-97e3121d--solver,verdicts" }],
      1,
    ],
    ["CI on main", [{ workflowName: "CI", headBranch: "main" }], 0],
    ["CI on a release branch only", [{ workflowName: "CI", headBranch: "release/0.14.0" }], 1],
    ["no run", [], 1],
  ])("on %s, the step exits %i", (_, runs, status) => {
    expect(withRuns(runs).status).toBe(status);
  });
});
