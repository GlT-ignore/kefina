const UK = "Europe/London";

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: UK, weekday: "short", day: "numeric", month: "short" });
const shortLabel = new Intl.DateTimeFormat("en-GB", { timeZone: UK, day: "numeric", month: "short" });
const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: UK, day: "numeric", month: "short", year: "numeric" });
const monthLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long" });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "09:20 GMT" or "09:20 BST", whatever the viewer's own clock. */
export function ukTime(iso: string): string {
  const date = new Date(iso);
  const wall = clock.format(date);
  const [h, m] = wall.split(":").map(Number);
  // Browsers name the UK zones differently ("GMT" or "GMT+0"), so read the offset from the clock instead.
  const offset = (h * 60 + m - (date.getUTCHours() * 60 + date.getUTCMinutes()) + 1440) % 1440;
  return `${wall} ${offset === 60 ? "BST" : "GMT"}`;
}

/** "09:20", UK wall clock. */
export function ukClock(iso: string): string {
  return clock.format(new Date(iso));
}

/** "Tue 27 Jan" */
export function ukDay(iso: string): string {
  return dayLabel.format(new Date(iso));
}

/** "27 Jan" */
export function ukShortDay(iso: string): string {
  return shortLabel.format(new Date(iso));
}

/** "24 Oct 2026" */
export function ukDate(iso: string): string {
  return dateLabel.format(new Date(iso));
}

/** "2025-10" or "2025-10-01" -> "October" */
export function monthName(iso: string): string {
  return monthLabel.format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));
}

/** 2038.9 -> "2,039"; signed adds "+" for positive values. */
export function num(value: number, signed = false): string {
  const text = whole.format(value);
  return signed && value > 0 ? `+${text}` : text;
}

/** 2038.9 -> "2,039 MW"; signed adds "+" for positive values. */
export function mw(value: number, signed = false): string {
  return `${num(value, signed)} MW`;
}

export function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** 16.5 -> "16.5", 20 -> "20" */
export function hoursText(h: number): string {
  return String(Math.round(h * 10) / 10);
}
