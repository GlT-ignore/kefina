import { useRef } from "react";

import type { Accuracy } from "../api";
import { num } from "../format";
import { bucketCovers, bucketLabel } from "../lib/accuracy";
import { linear } from "../lib/chart";
import { useSize } from "../hooks";

interface Props {
  rows: Accuracy["by_lead_time"];
  h0: number;
  h1: number;
}

export function LeadTimeChart({ rows, h0, h1 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const w = Math.max(280, useSize(box, { w: 600, h: 0 }).w);
  const rowH = 34;
  const m = { t: 8, r: 78, b: 8, l: 104 };
  const h = m.t + rows.length * rowH + m.b;
  const sx = linear(0, Math.max(...rows.map((r) => r.mae_mw ?? 0)), 0, w - m.l - m.r);
  const first = rows[0];
  const last = rows[rows.length - 1];
  return (
    <div className="svg-box" ref={box}>
      <svg
        className="bars"
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        role="img"
        aria-label={`Mean absolute error by lead time, from ${num(first.mae_mw ?? 0)} MW at ${bucketLabel(first.bucket)} to ${num(last.mae_mw ?? 0)} MW at ${bucketLabel(last.bucket)}.`}
        focusable="false"
      >
        {rows.map((r, i) => {
          const yy = m.t + i * rowH;
          const bw = sx(r.mae_mw ?? 0);
          return (
            <g key={r.bucket} className={`bar${bucketCovers(r.bucket, h0, h1) ? " is-on" : ""}`}>
              <text className="bar-label" x={0} y={yy + rowH / 2 + 4}>
                {bucketLabel(r.bucket)}
              </text>
              <rect x={m.l} y={yy + 9} width={bw.toFixed(1)} height={rowH - 18} rx={2} />
              <text className="bar-val" x={m.l + bw + 8} y={yy + rowH / 2 + 4}>
                {num(r.mae_mw ?? 0)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
