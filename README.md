# Readback: GB wind forecast at the gate

A pilot for a GB energy supplier's day-ahead desk. It shows the national wind forecast the desk actually had when each day-ahead auction closed, next to metered wind, and how far those forecasts were off, for purchase decisions made in January 2026.

Data: Elexon BMRS, national wind only. Actuals from FUELHH (`fuelType` WIND), forecasts from WINDFOR.

## How to start

With Docker (one image serves the app and the API):

```bash
docker compose up --build        # http://localhost:8000
```

Without Docker ([uv](https://docs.astral.sh/uv/) and Node 24):

```bash
uv sync
uv run uvicorn backend.main:app --port 8000   # API, reference at http://localhost:8000/docs
cd web && npm ci && npm run dev               # app at http://localhost:5173, proxies /api to port 8000
```

Checks:

```bash
uv run pytest -q && uv run ruff check . && uv run ruff format --check .
cd web && npm run lint && npm test
```

Production build of the web app (prerenders the opening view so the page reads with JavaScript off):

```bash
uv run python -m scripts.export_web_data   # writes web/prerender-data.json from the API code
cd web && npm run build                    # web/dist, which FastAPI then serves at /
```

Refresh the data (the app never calls Elexon at runtime):

```bash
uv run python -m scripts.ingest           # rewrites data/*.csv.gz and data/manifest.json
uv run python -m scripts.select_windows   # rewrites data/windows.json from Oct to Dec 2025 only
```

## Files and directories

```
backend/
  config.py        every open decision in one place: gates, January window, frozen trailing windows
  core.py          pure functions: run selection, UK-time gate cutoffs, hourly alignment, metrics, trailing stats, backtest
  store.py         builds one error table per gate at startup and answers each endpoint from it
  models.py        Pydantic response models (the API contract)
  main.py          FastAPI app: five read-only GET endpoints, then the built web app at /
scripts/
  ingest.py          pulls the snapshot from the Elexon Insights API
  select_windows.py  picks trailing window lengths on Oct to Dec 2025, writes data/windows.json
  export_web_data.py writes the opening view's API answers for the web build to prerender
data/
  fuelhh_wind.csv.gz   half-hourly metered wind, 31 Aug 2025 to 4 Feb 2026
  windfor.csv.gz       every WINDFOR run published 29 Aug 2025 to 2 Feb 2026
  manifest.json        pull time, ranges, row counts, sha256
  windows.json         calibration result behind the frozen windows
tests/             pytest: rules on hand-checkable cases, pinned January numbers, API contract
web/
  src/App.tsx          the page: gate console, bulletin log, chart, drift, accuracy, track record
  src/components/      one component per view (DayStrip, Bulletins, ForecastChart, DriftLadder, Ledger, TrackRecord, ...)
  src/lib/             pure helpers behind the views (run labels, chart scales and paths), with Vitest tests
  src/api.ts           typed API client mirroring backend/models.py
  src/format.ts        UK time and number formatting
  src/motion.ts        GSAP and Lenis setup, off under reduced motion
  scripts/prerender.mjs  renders the opening view into dist/index.html at build time
Dockerfile           stages: Python API, opening-view export, Node web build, final Python image serving both
docker-compose.yml, .github/workflows/ci.yml
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/health` | snapshot pull time and January hour count |
| `GET /api/meta` | gates, delivery window, frozen windows, data attribution |
| `GET /api/decision?day=2026-01-28&gate=epex_0920` | the run used at the gate, each hour's forecast vs actual, and every earlier and later run for the day (forecast drift) |
| `GET /api/accuracy?gate=epex_0920` | January metrics, error by lead time, monthly bias Oct to Jan, the mean miss for every delivery day, worst days, coverage by hour of day |
| `GET /api/track-record` | three ways to plan around the forecast, scored on January, plus the calibration that chose their settings |

Gates: `epex_0920` (EPEX hourly, default), `n2ex_0950` (N2EX hourly), `epex_1530` (EPEX half-hourly). Times are UTC with a `Z`; the app shows UK time.

## Decision log

- **Decision time.** A day-ahead buyer bids before gate closure on the day before delivery. Default 09:20 UK (EPEX hourly auction), with 09:50 (N2EX) and 15:30 (EPEX half-hourly). Gates are UK local times converted to UTC, so they stay right across clock changes.
- **Forecast available at the gate.** The newest WINDFOR run published strictly before the gate. A run stamped exactly 15:30 could not have fed the 15:30 auction. The 09:50 preset assumes the 09:30 run was in hand 20 minutes later.
- **Backcasts dropped.** Each WINDFOR run also restates about 25 past hours. Rows whose target is not after the publish time are not forecasts.
- **Run times are never hard-coded.** WINDFOR publishes about 8 times a day, but on 15 January the 11:30 run went out at 12:25, and the app uses it as the run in hand at 15:30.
- **January window.** "Decisions made in January" means decision days 1 to 31 January, so delivery days 2 January to 1 February.
- **Hourly comparison.** Forecasts are hourly and actuals half-hourly. The actual for an hour is the mean of its two half-hours (the energy in that hour). Using only the on-the-hour half-hour changes MAE by about 16 MW.
- **Error sign.** Forecast minus actual. Positive means the forecast overstated wind.
- **Metrics.** MAE, RMSE, bias, MAE as a percentage of mean output, share of hours over-forecast, P10/P50/P90 of error. No MAPE, because it explodes on calm hours.
- **Trailing windows chosen before January.** The margin (trailing P90 of error) and the bias correction (trailing mean error) use only actuals published before each gate. Window lengths were chosen on October to December 2025 delivery at the 09:20 gate, then frozen. Longer margin windows covered better there, and 28 days was the longest tried (87.7% against a 90% aim). Bias correction used 7 days, which had the lowest total mismatch. January was scored once with those settings.
- **Snapshot, not live calls.** January is history, so the app serves a committed snapshot and never calls Elexon while running.
- **Computed at startup.** Building every table takes about 0.3 s after a 0.4 s import (measured), so there is no separate precompute step.
- **Prerendered opening view.** The build renders 28 January at 09:20 into the HTML with its data, so the page reads with JavaScript off and needs no request before the first paint. Every other view loads from the API.
- **One image.** FastAPI serves both the API and the built app from one origin, so there is no CORS and one deploy.

## Limits

- One winter of data. With about 31 independent decision days, coverage figures are roughly plus or minus 10 points.
- The forecast ran above metered wind in every month checked (Oct +1,789 MW, Nov +1,007, Dec +1,449, Jan +1,852 at 09:20). Turn-down of wind farms by the system operator explains part of it. The rest has no published explanation.
- FUELHH exposes no revision history. Values are as of the pull date in `data/manifest.json`.
- Volumes are national, not a supplier's own position, and there are no prices, so the backtest compares volumes only. It is not trading advice.
- Checked in Chromium through automated browser tests; not yet on Firefox or iOS Safari.

## Use of AI tools

I used AI coding assistants (Claude Code) throughout this project: to research the Elexon datasets and GB auction rules, to run the first analysis on real data, to draft the plan, to build two design directions as working prototypes (one was chosen and ported), and to draft most of the code and tests. Every rule has a test, every headline number is pinned against an independent analysis script, and the full set of checks above runs in CI.

## Data attribution

Contains BMRS data © Elexon Limited copyright and database right 2026. Used under the [BMRS data licence](https://www.elexon.co.uk/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/).
