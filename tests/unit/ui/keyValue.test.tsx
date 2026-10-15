import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { KeyValue, presentRows } from "../../../src/ui/detail/KeyValue";

afterEach(cleanup);

describe("presentRows", () => {
  it("drops a row whose value is null, undefined or an empty string, and keeps the others in order", () => {
    const rows = [
      { label: "a", value: "x" },
      { label: "b", value: null },
      { label: "c", value: undefined },
      { label: "d", value: "" },
      { label: "e", value: 0 },
    ];

    expect(presentRows(rows).map((row) => row.label)).toEqual(["a", "e"]);
  });
});

describe("KeyValue", () => {
  it("renders one term and one description per row", () => {
    const { container } = render(
      <KeyValue
        rows={[
          { label: "installed", value: "1.0.0" },
          { label: "type", value: "library" },
        ]}
      />,
    );

    expect([...container.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["installed", "type"]);
    expect([...container.querySelectorAll("dd")].map((dd) => dd.textContent)).toEqual(["1.0.0", "library"]);
  });

  it("renders nothing for an empty row set, so a section keeps its own heading", () => {
    const { container } = render(<KeyValue rows={[]} />);

    expect(container.childNodes).toHaveLength(0);
  });
});
