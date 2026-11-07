import { fireEvent, screen } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import { assembleEmbed } from "../../scripts/report2-embed";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

test("mount() leaves the title of the embedder's page alone, also across a tab switch and unmount", async () => {
  vi.stubGlobal("__LOCKROT_REPORT_VERSION__", "0.0.0-test");
  const { mount } = await import("../../src/main");
  document.title = "An embedder's page";
  const target = document.createElement("div");
  document.body.append(target);

  const handle = mount(target, assembleEmbed("composite"));
  fireEvent.click(screen.getByRole("tab", { name: /^Findings/ }));
  const mounted = document.title;
  handle.unmount();

  expect(mounted).toBe("An embedder's page");
  expect(document.title).toBe("An embedder's page");
});
