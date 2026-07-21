<div align="center">

# airmon

**An open, CC0 record of what played, when, on which Canadian radio station — facts, not audio.**

[![live](https://img.shields.io/badge/live-spintel.ca-4b9cff)](https://spintel.ca/)
[![collect](https://github.com/HudsonGraeme/airmon/actions/workflows/collect-airplay.yml/badge.svg)](https://github.com/HudsonGraeme/airmon/actions/workflows/collect-airplay.yml)
[![data: CC0](https://img.shields.io/badge/data-CC0-brightgreen.svg)](#license)
[![code: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)

</div>

---

## What is this?

airmon watches a handful of Canadian radio stations' **own public now-playing feeds** and records every track they announce — artist, title, timestamp, station — into an append-only log kept **inside this repository**. A GitHub Actions cron is the only moving part on the collection side: it polls, commits new spins back to `main`, and that git history *is* the database. A static site rebuilds from the committed data and serves instant client-side search, charts, and a "this week" leaderboard.

Unlike a scraper, airmon reads only the short **text metadata** stations already publish for their web players. It never records, stores, or restreams audio — playlist facts aren't copyrightable, audio is. Keep it that way.

No servers, no database to run, no audio. Two moving parts: a Go binary in CI and a static site.

**→ [spintel.ca](https://spintel.ca/)**

---

## How it works

```
GitHub Actions cron (~hourly)
  └─ Go collector ─▶ poll each station's public now-playing feed
                     ├─ append new spins → data/spins/YYYY-MM.ndjson   ← git is the database
                     ├─ record poll outcome → data/health.json
                     └─ git commit + push  [skip ci]

GitHub Actions (on site change, and every 6h)
  └─ build-data.mjs ─▶ consolidate NDJSON → static JSON
                       └─ Vite + React + Recharts → docs/ ─▶ GitHub Pages
```

The collector is stdlib-only Go. A per-station cursor in `data/state.json` makes runs idempotent, so overlapping polls never double-count. The site is baked from the committed data on every relevant push (and on a schedule, to fold in newly collected spins), then served straight from the `docs/` folder — there is nothing to deploy and nothing to keep warm.

| Component | Stack |
|---|---|
| Collector | **Go** (stdlib only), run by a **GitHub Actions** cron |
| Store | **git** — month-partitioned NDJSON under `data/spins/` |
| Frontend | **TypeScript + React + Chakra UI**, built with **Vite** + **pnpm** |
| Charts | **Recharts** + in-memory filtering over the committed data |
| Hosting | **GitHub Pages** (from `/docs`) |

---

## The data

Every spin is one line of NDJSON. Field names are short because the log grows without bound:

```json
{"s":"chum-1045","a":"Katy Perry","t":"Roar","at":1783981838,"src":"triton"}
```

`s` station id · `a` artist · `t` title · `at` unix seconds · `src` adapter.

Files are partitioned by month (`data/spins/2026-07.ndjson`), the config lives in `data/stations.json`, and each run also writes `data/health.json` — the collector's own record of whether each feed answered (last poll, last ok, last spin, consecutive failures), because "quiet feed" and "dead feed" look identical from the spin log alone.

The dataset is **CC0**. It is deliberately multi-broadcaster and multi-artist — a general airplay record, not a dossier on anyone.

---

## Stations & adapters

Both adapters hit public, unauthenticated endpoints.

| Adapter | Broadcaster | Feed shape | Notes |
|---|---|---|---|
| `triton` | Bell Media / iHeartRadio Canada | timestamped recent history | catches every spin between polls |
| `streamb` | Evanov Communications | current track only | history reconstructed from state changes |

Six stations today: CHUM 104.5, Virgin 99.9 (Toronto), Virgin 95.9 (Montreal), CHOM 97.7, The Beat 94.5 (Vancouver), and Z103.5.

---

## Collector

```bash
cd radio-airplay-monitor/collector
go run . -data ../data      # one polling pass; appends new spins + updates state/health
```

Capture behaviour is tuned per station with a **strategy**, resolved by precedence —
built-in defaults **<** the config `defaults` block **<** a station's own `strategy` — so a station only names what it overrides:

```jsonc
{
  "defaults": { "history_fetch": 30, "max_retries": 2, "retry_backoff_ms": 500 },
  "stations": [
    // fast CHR rotation: pull deeper so a slipping cron never drops a spin
    { "id": "virgin-999-toronto", "adapter": "triton", "mount": "CKFMFMAAC",
      "strategy": { "history_fetch": 40 } },
    // current-only feed: no history, so re-sample across the run to catch changes
    { "id": "z1035-toronto", "adapter": "streamb", "url": "…",
      "strategy": { "sample_window_s": 300, "sample_every_s": 20, "max_retries": 4 } }
  ]
}
```

| Strategy key | Applies to | Effect on capture |
|---|---|---|
| `history_fetch` | timestamped adapters | rows pulled per poll; raise it so gaps between polls don't lose spins |
| `sample_window_s` | current-track adapters | keep re-sampling this long each run to catch songs between polls (`0` = one poll) |
| `sample_every_s` | current-track adapters | interval between samples within the window |
| `max_retries` | all | extra attempts on a failed fetch so one blip doesn't cost a whole interval |
| `retry_backoff_ms` | all | base delay between attempts (scales per attempt) |
| `enabled` | all | set `false` to park a station without deleting it |

Adding a **source type** is one registry entry in [`collector/adapters.go`](radio-airplay-monitor/collector/adapters.go) — a `fetch` func plus a `fetchMode` (`modeTimestamped` or `modeCurrent`); the main loop picks it up by the station's `adapter` key.

---

## The site

```bash
cd radio-airplay-monitor/web
pnpm install
pnpm dev        # regenerates data, then Vite dev server
pnpm build      # → repo-root docs/  (runs build-data.mjs, tsc, vite)
```

It loads the baked JSON and filters/aggregates it in memory — a full scan per keystroke is sub-millisecond at this scale — driving a stacked airplay-over-time chart, top-artist and per-station breakdowns, a click-to-compare panel (share vs the field, in σ), a feed-health board, and a spreadsheet-style spin log. GitHub Pages serves `docs/` as the site root.

### Adding a feed

1. Find the station's public now-playing endpoint (many use Triton's `np.tritondigital.com/public/nowplaying?mountName=…`; others expose a small JSON/XML feed like Evanov's StreamB).
2. Reuse an adapter if the shape matches, or register a new one (see above).
3. Add the station to `data/stations.json`.

---

## Limitations

- **Current-track feeds undersample.** `streamb` only exposes the song playing right now, and GitHub throttles the cron to roughly hourly, so even with in-run sampling a station like Z103.5 captures a fraction of what the timestamped feeds do. Fully capturing it needs higher-frequency polling than a free cron reliably provides.
- **Metadata is only as good as the station's.** A mislabelled or omitted now-playing entry is a mislabelled or omitted spin. For evidence-grade coverage you'd add audio fingerprinting — out of scope here, on purpose.
- **The σ in the compare panel ranks over-representation, it is not a significance test.** The artist field is heavy-tailed (many one-spin artists), so any rotated artist reads several σ above the mean.
- **Early windows are small samples.** Aggregates settle as the log grows.

---

## License

Data is **CC0** — playlist facts aren't copyrightable (Feist; CCH Canadian), and airmon takes no editorial position. Code is **[MIT](LICENSE)**.
