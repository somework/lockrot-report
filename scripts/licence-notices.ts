import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGE_ROOT = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;
const LICENCE_FILE = /^licen[cs]e/i;

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
    license?: string;
  };
  const file = readdirSync(root).find((entry) => LICENCE_FILE.test(entry));
  if (file === undefined) {
    throw new Error(`bundled package ${manifest.name} has no licence file in ${root}`);
  }
  const text = readFileSync(join(root, file), "utf8").trim();
  if (text.includes("*/")) {
    throw new Error(`the licence text of ${manifest.name} would close the notice comment`);
  }
  return { name: manifest.name, version: manifest.version, license: manifest.license ?? "see below", text };
}

/** The comment that opens the bundle: each bundled package with its version and licence file. */
export function licenceBanner(moduleIds: readonly string[]): string {
  const notices = packageRoots(moduleIds)
    .map(readNotice)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  if (notices.length === 0) return "";
  const sections = notices.map((n) => `${n.name} ${n.version} (${n.license})\n\n${n.text}`);
  return `/*! Third-party software in this file:\n\n${sections.join("\n\n")}\n*/\n`;
}

/** Prepends the licence notice of every package in the chunk, read from the package's own files. */
export const licenceNotices = {
  name: "lockrot-licence-notices",
  enforce: "post" as const,
  renderChunk(code: string, chunk: { moduleIds: readonly string[] }) {
    return { code: licenceBanner(chunk.moduleIds) + code, map: null };
  },
};
