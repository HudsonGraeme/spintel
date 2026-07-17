# airmon — open Canadian radio airplay monitor

An open, **CC0** dataset of Canadian radio **airplay facts** — *what track played,
when, on which station* — collected from broadcasters' own public now-playing
endpoints, stored in-repo (git-as-database), and surfaced through a Cloudflare
Pages frontend with instant client-side search.

A **multi-broadcaster, multi-artist** public resource: every track on every
monitored station is logged and searchable, with per-station and per-artist
aggregates. No station or artist is singled out — it's a general airplay record.

> **Facts, not audio.** airmon reads the short "now playing" text metadata
> stations already publish. It does **not** record, store, or redistribute audio.
> Playlist facts aren't copyrightable; audio is. Keep it that way.

## Architecture

```
GitHub Actions cron (every 10 min)
   └─ Go collector ─► fetch each station's public now-playing endpoint
                      └─ append new spins to data/spins/YYYY-MM.ndjson
                         └─ git commit + push   ← the database is the repo

Cloudflare Pages (on push)
   └─ pnpm build ─► build-data.mjs consolidates NDJSON → static JSON
                    └─ Vite + React + Chakra app: filters, Recharts graphs, search
```

No servers, no database to run, no audio. Two moving parts: a Go binary in CI and
a static site.

| Component | Stack |
|---|---|
| Collector | **Go** (stdlib only), run by **GitHub Actions** cron |
| Store | **git** — month-partitioned NDJSON under `data/spins/` |
| Frontend | **TypeScript + React + Chakra UI**, built with **Vite** + **pnpm** |
| Dashboard | **Recharts** graphs + in-memory filters (search, station, source, time window) over the committed data |
| Hosting | **Cloudflare Pages** |

### Station adapters (both public, unauthenticated)

| Adapter | Broadcaster | Data | Notes |
|---|---|---|---|
| `triton` | Bell Media / iHeartRadio Canada | timestamped recent history | catches every spin between polls |
| `streamb` | Evanov Communications | current track only | history built from state changes |

Default stations (`data/stations.json`): CHUM 104.5, Virgin 99.9 Toronto, Virgin
95.9 Montreal, CHOM 97.7, The Beat 94.5 Vancouver, Evanov Z103.5.

## Collector (Go)

```bash
cd collector
go run . -data ../data      # one polling pass; appends new spins + updates state
```

Idempotent: a per-station cursor in `data/state.json` means overlapping runs never
double-count. Runs automatically via [`.github/workflows/collect-airplay.yml`](../.github/workflows/collect-airplay.yml).

> GitHub only fires `schedule` from the **default branch**, so the cron starts
> once this is merged to `master`. Use the workflow's **Run workflow** button to
> test it from a branch.

### Configuration & per-station strategy

`data/stations.json` drives the collector. To **add a station**, append an object
with an `id`, display fields, an `adapter`, and that adapter's locator (`mount`
for `triton`, `url` for `streamb`).

Capture behaviour is tuned with a **strategy**, resolved by precedence —
built-in defaults **<** the config `defaults` block **<** a station's own
`strategy`, so a station only names what it overrides:

```jsonc
{
  "defaults": { "history_fetch": 20, "max_retries": 2, "retry_backoff_ms": 500 },
  "stations": [
    // fast CHR rotation: pull deeper so a slipping cron never drops a spin
    { "id": "virgin-999-toronto", "adapter": "triton", "mount": "CKFMFMAAC",
      "strategy": { "history_fetch": 30 } },
    // current-only feed: no history to fetch, so lean on retries instead
    { "id": "z1035-toronto", "adapter": "streamb", "url": "…",
      "strategy": { "max_retries": 4 } }
  ]
}
```

| Strategy key | Applies to | Effect on capture |
|---|---|---|
| `history_fetch` | timestamped adapters (`triton`) | rows pulled per poll; raise it so gaps between polls don't lose spins |
| `max_retries` | all | extra attempts on a failed fetch so one blip doesn't cost a whole interval |
| `retry_backoff_ms` | all | base delay between attempts (scales per attempt) |
| `enabled` | all | set `false` to park a station without deleting it |

To add a whole new **source type**, register an adapter in
[`collector/adapters.go`](collector/adapters.go) (its `fetch` func plus a
`fetchMode` — `modeTimestamped` or `modeCurrent`); the main loop picks it up by
its `adapter` key with no further changes.

## Frontend (Cloudflare Pages)

```bash
cd web
pnpm install
pnpm dev       # local dev (regenerates data first)
pnpm build     # → web/dist  (runs build-data.mjs, tsc, vite)
```

**Cloudflare Pages settings:**

| Setting | Value |
|---|---|
| Root directory | `radio-airplay-monitor/web` |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Package manager | pnpm (via `packageManager` / auto-detected) |

The build reads `../data` and emits `web/public/data/{spins,stations,meta}.json`;
the app fetches those and filters/aggregates them in memory (a full scan per
keystroke is sub-millisecond at this scale). For much larger logs, chunk the spin
file or precompute the aggregates at build time.

## Adding a station

1. Find its public now-playing endpoint (many use Triton's
   `np.tritondigital.com/public/nowplaying?mountName=…`; others expose a small
   JSON/XML feed like Evanov's StreamB).
2. Reuse an adapter if the shape matches, or register a new one in
   `collector/adapters.go` (a `fetch` func plus its `fetchMode`); the main loop
   picks it up by the station's `adapter` key.
3. Add the station to `data/stations.json` (see *Configuration & per-station
   strategy* above).

## Roadmap — audio fingerprinting

Metadata misses spins a station mislabels or omits (often the recurrent/catalog
rotation you'd care about). For **evidence-grade** monitoring, add a fingerprinting
collector that IDs songs from the live stream audio against a reference DB
([Olaf](https://github.com/JorenSix/Olaf) / [Panako](https://github.com/JorenSix/Panako)
/ [Dejavu](https://github.com/worldveil/dejavu), or ACRCloud). Fingerprint and
discard — never store or restream audio.

## Good-faith collection & legal

- Identifiable `User-Agent`; a 10-minute poll interval. Be polite; back off on
  errors; respect `robots.txt`.
- Publishing *what played when* is what existing aggregators already do; facts
  aren't copyrightable (Feist; CCH Canadian). Re-streaming **audio** is not — don't.
- The dataset takes no editorial position. Not legal advice; for adversarial
  publication, consult a media/IP lawyer (in Canada, CIPPIC/EFF).
