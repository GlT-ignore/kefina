import { describe, expect, it } from "vitest";

import type { Meta, TrackRecord } from "../api";
import { bucketCovers, bucketLabel } from "./accuracy";
import { calibrationLabels, deliveryDays, gateName, periodLabels } from "./meta";
import { nextGate, viewFromSearch, viewSearch } from "./view";

const meta = { delivery_first: "2026-01-02", delivery_last: "2026-02-01" } as Meta;
const days = deliveryDays(meta.delivery_first, meta.delivery_last);
const opening = { day: "2026-01-28", gate: "epex_0920" } as const;

describe("delivery window", () => {
  it("lists every delivery day", () => {
    expect(days).toHaveLength(31);
    expect([days[0], days[30]]).toEqual(["2026-01-02", "2026-02-01"]);
  });

  it("labels the period from the window", () => {
    expect(periodLabels(meta)).toEqual({ month: "January 2026", delivery: "2 Jan to 1 Feb 2026", decisions: "1 to 31 Jan" });
  });

  it("shortens gate labels", () => {
    expect(gateName({ id: "epex_1530", label: "EPEX half-hourly auction, 15:30", closes_uk: "15:30" })).toBe("EPEX half-hourly");
  });

  it("describes the calibration window", () => {
    const c = { calibration_days: ["2025-10-01", "2025-12-31"], margin_coverage: { 7: 0.8, 28: 0.88, 14: 0.85 } } as unknown as TrackRecord["calibration"];
    expect(calibrationLabels(c)).toEqual({ span: "October to December 2025", longest: 28 });
  });
});

describe("view in the URL", () => {
  it("reads a deep link and ignores unknown values", () => {
    expect(viewFromSearch("?day=2026-01-12&gate=n2ex_0950", days, opening)).toEqual({ day: "2026-01-12", gate: "n2ex_0950" });
    expect(viewFromSearch("?day=2025-12-01&gate=nope", days, opening)).toEqual(opening);
    expect(viewSearch(opening)).toBe("?day=2026-01-28&gate=epex_0920");
  });

  it("cycles the gates", () => {
    expect(nextGate("epex_1530")).toBe("epex_0920");
  });
});

describe("lead-time buckets", () => {
  it("labels and matches buckets against the hours ahead", () => {
    expect(bucketLabel("12-18h")).toBe("12 to 18 h");
    expect(bucketLabel("48h+")).toBe("48 h and more");
    expect(bucketCovers("12-18h", 16.5, 39.5)).toBe(true);
    expect(bucketCovers("0-6h", 16.5, 39.5)).toBe(false);
    expect(bucketCovers("48h+", 16.5, 39.5)).toBe(false);
    expect(bucketCovers("48h+", 40, 63)).toBe(true);
  });
});
