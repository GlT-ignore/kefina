/** Where each step of the print sits in the scene's 0 to 1 progress. */
export const PHASE = { printA: 0.04, printB: 0.5, perfB: 0.56, tearB: 0.68, rollB: 0.82, stampA: 0.84, stampB: 0.9 };

/** Progress through the stretch from a to b, clamped to 0..1. */
export function seg(p: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (p - a) / (b - a)));
}

/**
 * n lines printed one after another between a and b: how much of each is inked,
 * the last line the head has reached (-1 for none) and how far into it the head is.
 */
export function printed(n: number, a: number, b: number, p: number): { fr: number[]; last: number; live: number } {
  const s = (b - a) / Math.max(1, n);
  const fr = Array.from({ length: n }, (_, i) => seg(p, a + i * s, a + (i + 0.8) * s));
  const last = fr.findLastIndex((f) => f > 0);
  return { fr, last, live: last < 0 ? 0 : fr[last] };
}
