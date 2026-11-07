/**
 * PD-A11Y-SWEEP-13 to 16 (DESIGN.md §5): the names and descriptions Chromium hands a screen reader match the
 * words the page writes. Chromium builds them from the rendered text, so CSS `text-transform` and a
 * line-break opportunity would otherwise reach them; only its own tree (CDP) shows that.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { createReportPage } from "./support/report";
import { advisoriesSurface } from "./support/report2/advisories";
import { openDetail2, openEveryFold } from "./support/report2/detail";
import { findingsSurface } from "./support/report2/findings";
import { overviewSurface } from "./support/report2/overview";
import { packagesSurface } from "./support/report2/packages";
import { radiusSurface } from "./support/report2/radius";
import { runSurface } from "./support/report2/run";

/** The style the second read lays over the page; the page's CSP admits no inline style. */
test.use({ bypassCSP: true });

const NO_TRANSFORM = "*, *::before, *::after { text-transform: none !important; }";

interface AxNode {
  ignored: boolean;
  nodeId: string;
  backendDOMNodeId?: number;
  role?: { value: string };
  name?: { value: string };
  description?: { value: string };
}

/** "role|name|description" of every node that a reader reaches by name, its text runs left out, keyed
 *  by its DOM node, so that a second read of the same page compares each node with itself. */
async function namedNodes(page: Page): Promise<Map<string, string>> {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as { nodes: AxNode[] };
  await cdp.detach();
  return nodes
    .filter((node) => !node.ignored && !["StaticText", "InlineTextBox"].includes(node.role?.value ?? ""))
    .filter((node) => (node.name?.value ?? "") !== "" || (node.description?.value ?? "") !== "")
    .reduce(
      (named, node) =>
        named.set(
          `${String(node.backendDOMNodeId ?? "")}:${node.nodeId}`,
          `${node.role?.value ?? ""}|${node.name?.value ?? ""}|${node.description?.value ?? ""}`,
        ),
      new Map<string, string>(),
    );
}

const SURFACES = [
  { case: "composite", pkg: "guzzlehttp/guzzle" },
  { case: "baselined-wallabag-2.6", pkg: "twig/twig" },
] as const;

const VIEWS: Record<string, (page: Page) => Locator> = {
  overview: overviewSurface,
  findings: findingsSurface,
  packages: packagesSurface,
  advisories: advisoriesSurface,
  radius: radiusSurface,
  run: runSurface,
};

async function openGlossary(page: Page): Promise<void> {
  await (await createReportPage(page)).openGlossary();
  await page.getByRole("dialog").evaluate((dialog) => {
    for (const details of dialog.querySelectorAll("details")) details.open = true;
  });
}

test.describe("report-2: the names Chromium reads out", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "the accessibility tree is read through CDP");

  for (const surface of SURFACES) {
    const opens: [string, (page: Page) => Promise<void>][] = [
      ...Object.entries(VIEWS).map(([view, band]): [string, (page: Page) => Promise<void>] => [
        view,
        async (page) => {
          await page.goto(`${report2Url(surface.case)}#view=${view}`);
          await band(page).waitFor();
        },
      ]),
      [
        `the ${surface.pkg} sheet`,
        async (page) => {
          await openEveryFold(await openDetail2(page, surface.case, surface.pkg));
        },
      ],
      [
        "the glossary",
        async (page) => {
          await page.goto(report2Url(surface.case));
          await openGlossary(page);
        },
      ],
    ];

    for (const [where, open] of opens) {
      test(`${surface.case}, ${where}: no name or description takes the capitals of CSS uppercase`, async ({
        page,
      }) => {
        await open(page);
        const shown = await namedNodes(page);
        await page.addStyleTag({ content: NO_TRANSFORM });
        const plain = await namedNodes(page);

        expect(shown.size).toBeGreaterThan(0);
        expect([...shown].filter(([id, node]) => plain.get(id) !== node).map(([, node]) => node)).toEqual([]);
      });

      test(`${surface.case}, ${where}: no package name gains a space where it may break`, async ({
        page,
      }) => {
        await open(page);

        expect([...(await namedNodes(page)).values()].filter((node) => /[\w.-]\/ [\w.-]/.test(node))).toEqual(
          [],
        );
      });
    }
  }
});

test("report-2: an Overview section heading keeps its name and its note apart", async ({ page }) => {
  await page.goto(report2Url("composite"));
  const band = overviewSurface(page);

  for (const name of [
    "Weighs most, highest score first",
    "Flags, packages carrying each; a package counts once per flag",
    "Blast radius, flagged packages each direct requirement pulls in",
  ]) {
    await expect(band.getByRole("heading", { name, exact: true })).toBeVisible();
  }
});
