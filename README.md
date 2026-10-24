# Apex Timing — 2026 Formula 1 timing

A Next.js application for the 2026 FIA Formula One World Championship: a live-timing tower, lap and sector analysis, tyre strategy, track map, race control, telemetry, results, schedule, drivers, teams and championship standings.

Its organising rule is **data integrity**. Every dataset carries provenance (provider, mode, source timestamp, fetch time, completeness). The UI shows one of `LIVE`, `HISTORICAL`, `SIMULATED DATA`, `OFFLINE` or `NO DATA`, and providers never stand in for each other. A failed live request shows an error, never demo or historical data presented as live.

## Run it

Requires Node.js 20.9 or later (tested on Node 24).

```bash
npm install
npm run dev
```

Open http://localhost:3000 (it redirects to `/timing`). No credentials are needed: completed 2026 sessions load from OpenF1's free historical API, results load from Jolpica-F1, and the **Demo** button in the header opens a fully simulated session.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit and API tests (Vitest) |
| `npm run typecheck` | TypeScript strict check |
| `npm run sync:season` | Regenerate the 2026 calendar from OpenF1 + Jolpica-F1 |

## Environment variables

All variables are server-only (no `NEXT_PUBLIC_` prefix). Copy `.env.example` to `.env.local`.

| Variable | Required | Meaning |
| --- | --- | --- |
| `OPENF1_USERNAME`, `OPENF1_PASSWORD` | Only for live timing | A paid OpenF1 account ([openf1.org/auth.html](https://openf1.org/auth.html)). The server exchanges these for a one-hour bearer token at `POST https://api.openf1.org/token`. Without them, a session in progress shows "Live timing unavailable" with the reason. |
| `OPENF1_BASE_URL` | No | Defaults to `https://api.openf1.org` |
| `JOLPICA_BASE_URL` | No | Defaults to `https://api.jolpi.ca/ergast/f1` |
| `OPENF1_MIN_REQUEST_SPACING_MS` | No | Minimum gap between upstream OpenF1 requests (default 350 ms), to stay within free-tier limits |

## Where each feature's data comes from

| Feature | Live (with credentials) | Without credentials | Demo mode |
| --- | --- | --- | --- |
| Timing tower (positions, gaps, intervals, laps, sectors, speed trap, tyres, pits, status) | OpenF1 live REST, polled every 4–30 s (user setting) | OpenF1 historical, completed sessions only; races can be replayed lap by lap | Simulated |
| Track status, session phase, lap deletions | Race-control messages (OpenF1) | Same, historical | Simulated, fictional messages |
| Race-control feed | OpenF1 | OpenF1 | Fictional, prefixed `[DEMO]` |
| Lap history, lap chart, sector comparison | OpenF1 laps + stints + pits + race control | Same | Simulated |
| Tyre strategy | OpenF1 stints (sourced); tyre age derived and marked `*` | Same | Simulated |
| Track map | Outline traced from OpenF1 position data for that session; car markers from OpenF1 `location` | Same; markers at the replay instant | Fictional circuit; simulated markers |
| Telemetry | OpenF1 `car_data` (speed, throttle, brake on/off, gear, RPM) | Same | Synthetic trace, labelled |
| Weather | OpenF1 | OpenF1 | Simulated, labelled |
| Results | Jolpica-F1 (GP, Sprint, Qualifying); OpenF1 `session_result` (Practice, Sprint Qualifying) | Same | Not used |
| Championship, drivers, teams | Computed from Jolpica-F1 classified results, cross-checked against Jolpica's published standings | Same | Not used |
| Schedule | `lib/config/season-2026.data.json`, generated from OpenF1 + Jolpica-F1 | Same | Not used |

Demo mode affects only Live Timing and Telemetry. Other pages always show real published data and say so while demo mode is on.

## Data-source research and limitations

- **Official F1 live timing** (formula1.com/en/timing/f1-live and the SignalR feed behind it) has no documented public API or licence for third-party apps, so it is not used.
- **OpenF1** is an unofficial community API (not affiliated with Formula 1). Historical data from 2023 onwards is free and unauthenticated; real-time data needs a paid account. It publishes no numeric rate limits, so the server spaces requests, de-duplicates in-flight requests, caches completed sessions for six hours and retries 429/5xx with backoff. A rate-limit hit is shown to the user rather than hidden.
- **OpenF1 locks its free tier during live sessions.** While any F1 session is on track (and shortly before), OpenF1 answers unauthenticated requests with HTTP 401 for all sessions, past ones included. The app shows "Paused during a live session" and nothing else in its place. Completed sessions already cached on the server, Jolpica-F1 results and standings, and the demo keep working.
- **Jolpica-F1** (the Ergast successor) supplies rounds, classifications, points and standings. Its constructor id for Racing Bulls is `rb`, which is mapped in `lib/config/teams-2026.ts`.
- **FastF1** is a Python library rather than a hosted API, so it can't serve a Next.js app. It reads the F1 timing archive after sessions and can record the undocumented live stream. It was not used, for the licensing reason above.
- **Lap times are only as fresh as the provider.** The live polling interval is how often this app asks its server for data, not the official feed's rate. OpenF1 documents intervals at about 4 s and car data at about 3.7 Hz. Live data older than 30 s is labelled `STALE`, and a failed poll keeps the last data on screen labelled `OFFLINE`.
- **Derived values are labelled as derived:**
  - Sector colours: OpenF1 gives sector times, not sector-best flags. Purple means the fastest valid sector in the session so far; green means the driver's own best.
  - Tyre age: the source's starting age plus laps completed.
  - Telemetry distance: integrated from speed. Lap B is scaled to lap A's length to cancel drift.
  - Qualifying phases: from SessionStatus messages, replaced by the final classification once published.
  - Circuit outlines: traced from position data.
- **Deleted laps** are matched by the lap time race control quotes. Race control's own lap counter differs from the timing feed's in practice sessions, so lap numbers are used only in races and only when no time is quoted. Messages that identify neither are left unresolved.
- **Status** (Safety Car, VSC, red flag, chequered flag, session start and finish) comes only from explicit race-control messages, never from gaps in data.
- **Points** use the 2026 tables (GP 25-18-15-12-10-8-6-4-2-1, Sprint 8 to 1, no fastest-lap point) in `lib/config/scoring.ts`. Displayed totals use the provider's published per-result points, which include penalties. The Championship page shows whether the computed standings match the published standings. Ties are broken by Grand Prix countback.
- **Classifications** published within 24 hours of a session are marked `PROVISIONAL`.
- **2026 regulations:** DRS no longer exists, so OpenF1's legacy `drs` channel is not shown. "Overtake enabled/disabled" race-control messages are categorised as such. No battery, energy or brake-temperature channels exist in any source, so none are shown.
- **Calendar:** the 2026 calendar as published by both sources includes the cancelled Bahrain and Saudi Arabian Grands Prix and the "Bahrain Grand Prix in Malaysia" at Sepang. Re-run `npm run sync:season` to pick up changes.
- **Line-up:** the 2026 grid in `lib/config/drivers-2026.ts` was cross-checked against OpenF1's entry list for the United States GP weekend and Jolpica-F1's driver list on 2026-10-24. Results data shows substitute appearances (Yuki Tsunoda at Racing Bulls and Liam Lawson at Red Bull in rounds 12–14). Results and standings always use each session's actual entrant.
- **Live mode is implemented but untested end to end**, because no OpenF1 credentials were available while building it. The credential gate, error paths and stale/offline logic have tests; the authenticated fetch path has not been exercised.

## Architecture

```text
Browser UI ──► /api/timing/[resource]  ──► OpenF1 provider (live | historical) ──► zod validation ──► normalisation ──► { data, provenance }
           ──► /api/results, /api/season, /api/circuit ──► Jolpica-F1 / OpenF1
           ──► demo provider (deterministic, runs in the browser; also exposed at /api/timing/*?mode=demo)
```

- `lib/config/`: the 2026 grid, teams, scoring and calendar (typed, validated at load).
- `lib/timing/`: domain types, formatters, calculations, the track-status state machine, zod schemas, pure OpenF1 normalisation, telemetry alignment.
- `lib/timing/providers/demo/`: a fictional circuit and a seeded race simulation. Everything is computed up front, so any instant is a pure function of time.
- `lib/server/`: upstream HTTP (rate spacing, retries, cache), OpenF1 and Jolpica clients, the OpenF1 providers, results and standings.
- `lib/client/`: settings (localStorage), column visibility (sessionStorage), the timing feed (provider selection, polling, out-of-order protection, freshness) and the demo clock.
- `components/`: the shell, timing tower and panels, track map, race control, strategy, telemetry and pages.

Deploying to Vercel works as-is: API routes are serverless functions and the cache is per instance.

## Tests

`npm test` runs 135 tests covering:

- lap-time, sector, gap and interval formatting
- sector-best detection and position ordering
- missing and invalid values
- tyre-stint calculations
- championship scoring and countback
- OpenF1 normalisation, including deleted-lap matching and retired cars
- stale-data detection and out-of-order update rejection
- the track-status state machine
- demo-data consistency (sectors sum to lap times, best laps match histories, no rewritten history)
- calendar time zones against the provider's GMT offsets
- API-route refusals (no credentials, upcoming or cancelled sessions)

There are no automated browser end-to-end tests; the main flows (timing tower with real and demo data, lap replay, track map, race control, results, schedule, driver/team pages, championship, telemetry, light theme, mobile width) were checked manually in a browser during development.
