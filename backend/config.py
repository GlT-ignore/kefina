"""Every decision the brief left open, in one place. The README decision log explains each."""

from dataclasses import dataclass
from datetime import date, time
from pathlib import Path
from typing import Literal

DATA = Path(__file__).resolve().parent.parent / "data"
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


@dataclass(frozen=True)
class Gate:
    label: str
    closes: time  # UK local time on the day before delivery


GateId = Literal["epex_0920", "n2ex_0950", "epex_1530"]

GATES: dict[GateId, Gate] = {
    "epex_0920": Gate("EPEX hourly auction, 09:20", time(9, 20)),
    "n2ex_0950": Gate("N2EX hourly auction, 09:50", time(9, 50)),
    "epex_1530": Gate("EPEX half-hourly auction, 15:30", time(15, 30)),
}
DEFAULT_GATE: GateId = "epex_0920"

# Decisions made 1 to 31 January buy for delivery 2 January to 1 February.
DELIVERY_FIRST, DELIVERY_LAST = date(2026, 1, 2), date(2026, 2, 1)

# Trailing windows chosen by scripts/select_windows.py on October to December 2025
# delivery at the 09:20 gate, then frozen. January never took part in the choice.
CALIBRATION_FIRST, CALIBRATION_LAST = date(2025, 10, 1), date(2025, 12, 31)
CANDIDATE_WINDOWS = (7, 14, 21, 28)
MARGIN_WINDOW_DAYS = 28
BIAS_WINDOW_DAYS = 7
