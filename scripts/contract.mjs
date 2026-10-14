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

const SPARSE = [
  "/tests/fixtures/contract/",
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

function checkout(commit) {
  if (checkedOutCommit() === commit) return;
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

function verify(pin) {
  const problems = [];
  const hash = bundleSha256(FIXTURES);
  if (hash !== pin.bundle_sha256)
    problems.push(`bundle_sha256 is ${hash}, the pin says ${pin.bundle_sha256}`);
  const provenance = readJson(join(BUNDLE, "provenance.json"));
  for (const key of ["text_grammar", "score_text_grammar"]) {
    if (provenance[key] !== pin[key]) problems.push(`${key} is ${provenance[key]}, the pin says ${pin[key]}`);
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
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error("repin takes a full 40-character lockrot commit");
  checkout(commit);
  const hash = bundleSha256(FIXTURES);
  const recorded = readFileSync(join(BUNDLE, "bundle_sha256"), "utf8").trim();
  if (hash !== recorded)
    throw new Error(`lockrot ${commit} records bundle_sha256 ${recorded}, its files hash to ${hash}`);
  const provenance = readJson(join(BUNDLE, "provenance.json"));
  const pin = {
    commit,
    bundle_sha256: hash,
    text_grammar: provenance.text_grammar,
    score_text_grammar: provenance.score_text_grammar,
  };
  writeFileSync(PIN, `${JSON.stringify(pin, null, 2)}\n`);
  for (const [name, path] of Object.entries(CONTRACT_FILES)) {
    copyFileSync(join(CHECKOUT, path), join(ROOT, "contract", name));
  }
  verify(pin);
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
