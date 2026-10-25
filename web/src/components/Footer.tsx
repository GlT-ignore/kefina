import type { Meta } from "../api";
import { ukDate, ukTime } from "../format";

export function Footer({ meta, month }: { meta: Meta; month: string }) {
  const zone = ukTime(`${meta.delivery_first}T12:00:00Z`).slice(6);
  return (
    <footer className="foot">
      <div className="wrap">
        <p className="foot-main">Historical backtest of {month} decisions. Not trading advice.</p>
        <p>{meta.attribution}.</p>
        <p>Data snapshot pulled {ukDate(meta.snapshot_pulled_at)}.</p>
        <p>
          Times are {zone}. In {month.split(" ")[0]}, UK time equals UTC.
        </p>
      </div>
    </footer>
  );
}
