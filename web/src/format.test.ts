import { describe, expect, it, vi } from "vitest";

import { hoursText, monthName, mw, num, pct, ukClock, ukDate, ukDay, ukShortDay, ukTime } from "./format";

describe("UK time labels", () => {
  it("shows January gate times in GMT", () => {
    expect(ukTime("2026-01-27T09:20:00Z")).toBe("09:20 GMT");
    expect(ukDay("2026-01-27T09:20:00Z")).toBe("Tue 27 Jan");
    expect(ukClock("2026-01-27T09:20:00Z")).toBe("09:20");
    expect(ukShortDay("2026-02-01")).toBe("1 Feb");
    expect(ukDate("2026-10-24T14:32:11+00:00")).toBe("24 Oct 2026");
    expect(monthName("2025-12")).toBe("December");
  });

  it("shows summer time as BST, an hour ahead of UTC", () => {
    expect(ukTime("2025-10-25T08:20:00Z")).toBe("09:20 BST");
    expect(ukTime("2025-07-01T23:30:00Z")).toBe("00:30 BST");
  });

  it("does not depend on the browser's own zone names", () => {
    // Some browser builds name the UK winter zone "GMT+0" instead of "GMT".
    const original = Intl.DateTimeFormat.prototype.formatToParts;
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockImplementation(function (
      this: Intl.DateTimeFormat,
      date?: Date | number,
    ) {
      return original.call(this, date).map((p) => (p.type === "timeZoneName" ? { ...p, value: "GMT+0" } : p));
    });
    try {
      expect(ukTime("2026-01-27T09:20:00Z")).toBe("09:20 GMT");
      expect(ukTime("2025-10-25T08:20:00Z")).toBe("09:20 BST");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("numbers", () => {
  it("rounds power and energy and signs bias", () => {
    expect(mw(2038.9)).toBe("2,039 MW");
    expect(mw(1747.9, true)).toBe("+1,748 MW");
    expect(mw(-506, true)).toBe("-506 MW");
    expect(pct(0.8965)).toBe("90%");
    expect(num(5374.8, true)).toBe("+5,375");
    expect(hoursText(16.5)).toBe("16.5");
    expect(hoursText(20)).toBe("20");
  });
});
