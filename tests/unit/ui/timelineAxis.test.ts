import { describe, expect, it } from "vitest";
import { placeYears } from "../../../src/ui/detail/timelineAxis";

const ticks = (...pairs: [number, number][]) => pairs.map(([year, x]) => ({ year, x }));

describe("placeYears (PD-TIMELINE-11)", () => {
  it("centres every year no guide comes near, the first on the axis's left edge", () => {
    // Act
    const years = placeYears(ticks([2014, 0], [2017, 30], [2020, 60]), []);

    // Assert
    expect(years.map((year) => year.place)).toEqual(["first", "centre", "centre"]);
  });

  it("moves a year beside a guide to the side away from it, rather than dropping it", () => {
    // Arrange: meilisearch-php's axis, 2020 to now; the 5y guide just left of 2022.
    const axis = ticks([2020, 0], [2022, 29.7], [2024, 59.4]);

    // Act
    const years = placeYears(axis, [25.7, 55.4]);

    // Assert: 2022 hangs right of its tick; 2024 has no side clear of the 3y guide and "today".
    expect(years.map((year) => [year.year, year.place])).toEqual([
      [2020, "first"],
      [2022, "after"],
    ]);
  });

  it("puts the label left of its tick when the guide is to its right", () => {
    // Act
    const years = placeYears(ticks([2010, 0], [2020, 60]), [66]);

    // Assert
    expect(years[1]?.place).toBe("before");
  });

  it("drops a year with no clear side, and never the first", () => {
    // Arrange: rector/rector's axis, 2017 to now; 2023 sits between the two guides.
    const axis = ticks([2017, 0], [2020, 30.8], [2023, 61.7]);

    // Act
    const years = placeYears(axis, [1, 48.6, 69.2]);

    // Assert
    expect(years.map((year) => year.year)).toEqual([2017, 2020]);
  });

  it("keeps, on a narrow strip, only a year that still fits there beside the first", () => {
    // Act: 2022 fits a 140px strip, clear of the 3y guide; 2020's label would touch the first's.
    const meili = placeYears(ticks([2020, 0], [2022, 29.7], [2024, 59.4]), [25.7, 55.4]);
    const close = placeYears(ticks([2014, 0], [2016, 12]), []);

    // Assert
    expect(meili.find((year) => year.year === 2022)?.keptAt).toEqual([140]);
    expect(close.flatMap((year) => year.keptAt)).toEqual([]);
  });

  it("keeps at most one year per narrow width, the one nearest the middle", () => {
    // Act
    const years = placeYears(ticks([2000, 0], [2008, 35], [2012, 58]), []);

    // Assert
    for (const tier of [140, 124, 108] as const) {
      expect(years.filter((year) => year.keptAt.includes(tier)).length).toBeLessThanOrEqual(1);
    }
    expect(years.find((year) => year.keptAt.includes(140))?.year).toBe(2012);
  });

  it("draws nothing but the first year for an axis of one tick", () => {
    expect(placeYears(ticks([2026, 0]), [40])).toEqual([{ year: 2026, x: 0, place: "first", keptAt: [] }]);
  });
});
