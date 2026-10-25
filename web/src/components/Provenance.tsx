import type { Meta } from "../api";
import { ukDate } from "../format";

export function Provenance({ meta, month }: { meta: Meta; month: string }) {
  return (
    <p className="provenance">
      {month} decisions, historical snapshot pulled {ukDate(meta.snapshot_pulled_at)}.
    </p>
  );
}
