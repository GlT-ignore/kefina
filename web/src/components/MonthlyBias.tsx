import { useRef } from "react";

import type { Accuracy } from "../api";
import { monthName, num } from "../format";
import { linear } from "../lib/chart";
import { useSize } from "../hooks";

export function MonthlyBias({ rows, scored }: { rows: Accuracy["monthly"]; scored: string }) {
  const box = useRef<HTMLDivElement>(null);
  const w = Math.max(280, useSize(box, { w: 600, h: 0 }).w);
  const h = 230;
  const m = { t: 30, r: 8, b: 44, l: 8 };
  const colW = (w - m.l - m.r) / rows.length;
  const bw = Math.min(64, colW * 0.46);
  const sy = linear(0, Math.max(...rows.map((r) => r.bias_mw)), 0, h - m.t - m.b);
  const base = h - m.b;
  return (
    <div className="svg-box" ref={box}>
      <svg
        className="cols"
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        role="img"
        aria-label={`Bias by calendar month: ${rows.map((r) => `${monthName(r.month)} ${num(r.bias_mw, true)} MW`).join(", ")}.`}
        focusable="false"
      >
        <line className="base" x1={m.l} x2={w - m.r} y1={base} y2={base} />
        {rows.map((r, i) => {
          const cx = m.l + colW * i + colW / 2;
          const bh = sy(r.bias_mw);
          return (
            <g key={r.month} className={`col${r.month === scored ? " is-on" : ""}`}>
              <rect x={(cx - bw / 2).toFixed(1)} y={(base - bh).toFixed(1)} width={bw.toFixed(1)} height={bh.toFixed(1)} rx={2} />
              <text className="col-val" x={cx} y={(base - bh - 10).toFixed(1)}>
                {num(r.bias_mw, true)}
              </text>
              <text className="col-label" x={cx} y={base + 22}>
                {monthName(r.month).slice(0, 3)}
              </text>
              <text className="col-sub" x={cx} y={base + 38}>
                {r.n} h
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
