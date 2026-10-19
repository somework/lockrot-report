// lockrot's rendering contract at the commit `contract/lockrot.json` pins (DESIGN.md §7).
//
//   node scripts/contract.mjs fetch           gets the pinned files into .lockrot/ and checks them
//   node scripts/contract.mjs repin <commit>  moves the pin and the committed contract/ files to <commit>
//
// .lockrot/ is a sparse, shallow checkout of lockrot, so every file keeps lockrot's relative path:
// the bundle hash reads paths below tests/fixtures/, and bundle.generated.ts imports ../../types/.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PIN = join(ROOT, "contract", "lockrot.json");
const CHECKOUT = join(ROOT, ".lockrot");
const REMOTE = "https://github.com/somework/lockrot.git";

/** Committed copy below contract/ → its path in lockrot. */
const CONTRACT_FILES = {
  "lockrot-report-2.schema.json": "resources/lockrot-report-2.schema.json",
  "lockrot-explain-2.schema.json": "resources/lockrot-explain-2.schema.json",
  "lockrot-report-2.d.ts": "types/lockrot-report-2.d.ts",
  "lockrot-report-2.known.d.ts": "types/lockrot-report-2.known.d.ts",
};

/** The model's documents of the `contract/page-goldens.json` entries (lockrot's `PageGoldensTest` reads the same). */
const PAGE_GOLDEN_DOCUMENTS = [
  "tests/fixtures/schema/documents/cases/B-dev-dagger.json",
  "tests/fixtures/schema/documents/cases/B-gate-none.json",
  "tests/fixtures/schema/documents/cases/E-ignored-whole-dagger.json",
  "tests/fixtures/schema/documents/cases/composite-generate-baseline.json",
  "tests/fixtures/schema/documents/cases/composite.json",
  "tests/fixtures/schema/documents/cases/guzzle-mixed.json",
  "tests/fixtures/schema/documents/cases/ok-offline-dagger.json",
  "tests/fixtures/schema/documents/cases/pagerfanta.json",
  "tests/fixtures/schema/documents/cases/policy-off-dagger.json",
  "tests/fixtures/schema/documents/cases/rounded-dev-dagger.json",
  "tests/fixtures/schema/documents/cases/unreached.json",
  "tests/fixtures/schema/documents/corpus/akaunting.json.gz",
  "tests/fixtures/schema/documents/corpus/matomo.json.gz",
  "tests/fixtures/schema/documents/corpus/moodle-v3.json.gz",
  "tests/fixtures/schema/documents/corpus/new-symfony.json.gz",
  "tests/fixtures/schema/documents/corpus/wallabag.json.gz",
  "tests/fixtures/schema/documents/coverage/baselined/new-slim.json.gz",
  "tests/fixtures/schema/documents/page/B-also.checked-dagger.json",
  "tests/fixtures/schema/documents/page/composite.other-day-same-cve-dagger.json",
  "tests/fixtures/schema/documents/page/composite.unknown-rules-dagger.json",
  "tests/fixtures/schema/documents/page/snipe-it.unloaded-dagger.json",
  "tests/fixtures/schema/documents/page/unknown.offline-dagger.json",
];

const SPARSE = [
  "/tests/fixtures/contract/",
  ...PAGE_GOLDEN_DOCUMENTS.map((path) => `/${path}`),
  "/tests/fixtures/baselined/*/check/report.bundle.json",
  "/tests/fixtures/bundle.generated.ts",
  "/tests/fixtures/flags/cases.json",
  "/types/",
  ...Object.values(CONTRACT_FILES)
    .filter((path) => !path.startsWith("types/"))
    .map((path) => `/${path}`),
];

const FIXTURES = join(CHECKOUT, "tests", "fixtures");
const BUNDLE = join(FIXTURES, "contract");

function git(...args) {
  return execFileSync("git", args, {
    cwd: CHECKOUT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function checkedOutCommit() {
  if (!existsSync(join(CHECKOUT, ".git"))) return null;
  try {
    return git("rev-parse", "HEAD");
  } catch {
    return null;
  }
}

function assertCommit(commit) {
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`${JSON.stringify(commit)} is not a full 40-character lockrot commit`);
  }
}

/** A tree that differs from the commit or from the sparse set is fetched again: the hash does not cover every file it holds. */
function isPristine(commit) {
  return (
    checkedOutCommit() === commit &&
    git("sparse-checkout", "list") === SPARSE.join("\n") &&
    git("status", "--porcelain", "--untracked-files=all") === ""
  );
}

function checkout(commit) {
  assertCommit(commit);
  if (isPristine(commit)) return;
  rmSync(CHECKOUT, { recursive: true, force: true });
  execFileSync("git", ["init", "--quiet", CHECKOUT], { stdio: "inherit" });
  git("remote", "add", "origin", REMOTE);
  git("sparse-checkout", "set", "--no-cone", ...SPARSE);
  git("fetch", "--quiet", "--depth=1", "--filter=blob:none", "origin", commit);
  git("checkout", "--quiet", "--detach", "FETCH_HEAD");
  if (checkedOutCommit() !== commit) throw new Error(`.lockrot/ is not at ${commit} after the fetch`);
}

function filesBelow(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** lockrot's `ContractBundle::bundleFiles()` and `ContractBundle::sha256()`. */
function bundleSha256(fixtures) {
  const bundle = join(fixtures, "contract");
  const inContract = filesBelow(bundle).filter((path) => {
    const rel = relative(bundle, path).split(sep).join("/");
    return !rel.startsWith("cache/") && rel !== "provenance.json" && rel !== "bundle_sha256";
  });
  const baselined = existsSync(join(fixtures, "baselined"))
    ? readdirSync(join(fixtures, "baselined"))
        .map((scenario) => join(fixtures, "baselined", scenario, "check", "report.bundle.json"))
        .filter((path) => existsSync(path))
    : [];
  const lines = [...inContract, ...baselined]
    .map((path) => ({ rel: relative(fixtures, path).split(sep).join("/"), path }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
    .map(({ rel, path }) => `${sha256(readFileSync(path))}  ${rel}\n`)
    .join("");
  return sha256(lines);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const GRAMMARS = ["text_grammar", "score_text_grammar"];
const OUTSIDE_THE_HASH = [
  "tests/fixtures/bundle.generated.ts",
  "tests/fixtures/flags/cases.json",
  ...PAGE_GOLDEN_DOCUMENTS,
];

function grammarsOf(provenance) {
  const missing = GRAMMARS.filter((key) => !Number.isInteger(provenance[key]));
  if (missing.length > 0) throw new Error(`lockrot's provenance.json has no integer ${missing.join(", ")}`);
  return Object.fromEntries(GRAMMARS.map((key) => [key, provenance[key]]));
}

function verify(pin) {
  const problems = [];
  const hash = bundleSha256(FIXTURES);
  if (hash !== pin.bundle_sha256)
    problems.push(`bundle_sha256 is ${hash}, the pin says ${pin.bundle_sha256}`);
  const grammars = grammarsOf(readJson(join(BUNDLE, "provenance.json")));
  for (const key of GRAMMARS) {
    if (grammars[key] !== pin[key]) problems.push(`${key} is ${grammars[key]}, the pin says ${pin[key]}`);
  }
  for (const path of OUTSIDE_THE_HASH) {
    if (!existsSync(join(CHECKOUT, path))) problems.push(`${path} is missing`);
  }
  for (const [name, path] of Object.entries(CONTRACT_FILES)) {
    const committed = join(ROOT, "contract", name);
    if (!existsSync(committed) || !readFileSync(committed).equals(readFileSync(join(CHECKOUT, path)))) {
      problems.push(`contract/${name} differs from lockrot's ${path}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`.lockrot/ at ${pin.commit} does not match the pin:\n  ${problems.join("\n  ")}`);
  }
}

function fetchPinned() {
  const pin = readJson(PIN);
  checkout(pin.commit);
  verify(pin);
  console.log(`.lockrot/ holds lockrot ${pin.commit}, bundle_sha256 ${pin.bundle_sha256}`);
}

function repin(commit) {
  checkout(commit);
  const hash = bundleSha256(FIXTURES);
  const recorded = readFileSync(join(BUNDLE, "bundle_sha256"), "utf8").trim();
  if (hash !== recorded)
    throw new Error(`lockrot ${commit} records bundle_sha256 ${recorded}, its files hash to ${hash}`);
  const pin = { commit, bundle_sha256: hash, ...grammarsOf(readJson(join(BUNDLE, "provenance.json"))) };
  // The pin moves last, so a failed copy leaves it naming the commit contract/ still holds.
  for (const [name, path] of Object.entries(CONTRACT_FILES)) {
    copyFileSync(join(CHECKOUT, path), join(ROOT, "contract", name));
  }
  writeFileSync(PIN, `${JSON.stringify(pin, null, 2)}\n`);
  console.log(`pinned lockrot ${commit}, bundle_sha256 ${hash}`);
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === "fetch") fetchPinned();
  else if (command === "repin") repin(argument);
  else throw new Error("usage: node scripts/contract.mjs fetch | repin <commit>");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
