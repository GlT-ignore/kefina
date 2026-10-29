/** "0-6h" -> "0 to 6 h", "48h+" -> "48 h and more" */
export function bucketLabel(b: string): string {
  return b.endsWith("+") ? `${b.slice(0, -2)} h and more` : `${b.replace("-", " to ").replace("h", "")} h`;
}
