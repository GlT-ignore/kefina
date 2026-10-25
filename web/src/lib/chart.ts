export type Point = readonly [number, number];

/** Maps a domain onto a pixel range. */
export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

const step = (range: number) => (range <= 8000 ? 2000 : range <= 16000 ? 4000 : 5000);

/** A zero-based MW axis rounded out to a readable step. */
export function mwAxis(values: number[]): { bottom: number; top: number; ticks: number[] } {
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values);
  const s = step(hi - lo);
  const top = Math.ceil(hi / s) * s;
  const bottom = Math.min(0, Math.floor(lo / s) * s);
  const ticks: number[] = [];
  for (let v = bottom; v <= top; v += s) ticks.push(v);
  return { bottom, top, ticks };
}

const xy = ([x, y]: Point) => `${x.toFixed(1)} ${y.toFixed(1)}`;

export function linePath(points: Point[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${xy(p)}`).join("");
}

/** The closed area between two lines that share x positions. */
export function bandPath(upper: Point[], lower: Point[]): string {
  return `${linePath(upper)}${[...lower].reverse().map((p) => `L${xy(p)}`).join("")}Z`;
}

/** A sparkline scaled to its own range, inset 2 px top and bottom. */
export function sparkPath(values: number[], w: number, h: number): string {
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  return linePath(values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - lo) / span) * (h - 4)]));
}

/** The index of the evenly spaced slot nearest to a position. */
export function nearestIndex(pos: number, start: number, end: number, count: number): number {
  const i = Math.round(((pos - start) / (end - start)) * (count - 1));
  return Math.max(0, Math.min(count - 1, i));
}
