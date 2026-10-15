import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { LegendButton, OutLink } from "../../../src/ui/common/common";

afterEach(cleanup);

describe("LegendButton", () => {
  it("names the click's effect in its title, unpressed", () => {
    render(<LegendButton tone="high" pressed={false} label="left-behind" count={3} onToggle={vi.fn()} />);

    const button = screen.getByRole("button", { name: "left-behind 3" });
    expect(button.getAttribute("title")).toBe("Show only left-behind");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("names clearing the filter in its title once pressed", () => {
    render(<LegendButton tone="high" pressed label="left-behind" count={3} onToggle={vi.fn()} />);

    const button = screen.getByRole("button", { name: "left-behind 3" });
    expect(button.getAttribute("title")).toBe("Showing only left-behind — click to clear this filter");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(<LegendButton tone="none" pressed={false} label="ok" count={2} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: "ok 2" }));

    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe("OutLink", () => {
  it("opens a safe address in a new tab without handing the page to it", () => {
    render(<OutLink href="https://lockrot.dev/verdicts/">the docs</OutLink>);

    const link = screen.getByRole("link", { name: "the docs" });
    expect(link.getAttribute("href")).toBe("https://lockrot.dev/verdicts/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows the text unlinked when the address is not a web address", () => {
    render(<OutLink href="javascript:alert(1)">the docs</OutLink>);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("the docs").tagName).toBe("SPAN");
  });

  it("shows the text unlinked when the document gave no address", () => {
    render(<OutLink href={null}>the docs</OutLink>);

    expect(screen.queryByRole("link")).toBeNull();
  });
});
