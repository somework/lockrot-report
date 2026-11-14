import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGE_ROOT = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;
const LICENCE_FILE = /^licen[cs]e/i;
// The page's script element, its HTML comment parsing, and the `{{…}}` slots lockrot fills.
const PAGE_MARKUP = /<\/script|<!--|<body|\{\{/i;

interface Notice {
  name: string;
  version: string;
  license: string;
  text: string;
}

function packageRoots(moduleIds: readonly string[]): string[] {
  const roots = moduleIds.flatMap((id) => {
    const root = PACKAGE_ROOT.exec(id)?.[1];
    return root === undefined ? [] : [root];
  });
  return [...new Set(roots)];
}

function readNotice(root: string): Notice {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
    version: string;
    license?: unknown;
  };
  const file = readdirSync(root).find((entry) => LICENCE_FILE.test(entry));
  if (file === undefined) {
    throw new Error(`bundled package ${manifest.name} has no licence file in ${root}`);
  }
  const text = readFileSync(join(root, file), "utf8").trim();
  if (text.includes("*/")) {
    throw new Error(`the licence text of ${manifest.name} would close the notice comment`);
  }
  if (PAGE_MARKUP.test(text)) {
    throw new Error(`the licence text of ${manifest.name} would break the page it is inlined into`);
  }
  const license = typeof manifest.license === "string" ? manifest.license : "see below";
  return { name: manifest.name, version: manifest.version, license, text };
}

/** The comment that opens the bundle: each bundled package with its version and licence file. */
export function licenceBanner(moduleIds: readonly string[]): string {
  const notices = packageRoots(moduleIds)
    .map(readNotice)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (notices.length === 0) return "";
  const sections = notices.map((n) => `${n.name} ${n.version} (${n.license})\n\n${n.text}`);
  return `/*! Third-party software in this file:\n\n${sections.join("\n\n")}\n*/\n`;
}
