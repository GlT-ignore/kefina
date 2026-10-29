type Scale = (v: number) => number;

/** Maps a domain onto a pixel range. */
export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
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

const r = (v: number) => v.toFixed(1);

/** Hourly values as a step line: each value holds flat across its slot. A missing value lifts the pen. */
export function stepPath(values: (number | undefined)[], x: Scale, y: Scale): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === undefined) {
      pen = false;
      return;
    }
    d += `${pen ? `V${r(y(v))}` : `M${r(x(i))} ${r(y(v))}`}H${r(x(i + 1))}`;
    pen = true;
  });
  return d;
}

/** One closed box per slot between two step lines. */
export function stepBands(a: number[], b: number[], x: Scale, y: Scale): string {
  return a.map((v, i) => `M${r(x(i))} ${r(y(v))}H${r(x(i + 1))}V${r(y(b[i]))}H${r(x(i))}Z`).join("");
}

/** The slot under a position, for `count` equal slots from start to end, clamped to the ends. */
export function slotIndex(pos: number, start: number, end: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(((pos - start) / (end - start)) * count)));
}
