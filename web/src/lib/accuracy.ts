/** "0-6h" -> "0 to 6 h", "48h+" -> "48 h and more" */
export function bucketLabel(b: string): string {
  return b.endsWith("+") ? `${b.slice(0, -2)} h and more` : `${b.replace("-", " to ").replace("h", "")} h`;
}

/** Whether a lead-time bucket overlaps the hours ahead a day was forecast from. */
export function bucketCovers(b: string, h0: number, h1: number): boolean {
  const lo = Number(b.split(/[-h+]/)[0]);
  const hi = b.endsWith("+") ? Infinity : Number(b.split("-")[1].replace("h", ""));
  return hi > h0 && lo < h1;
}
