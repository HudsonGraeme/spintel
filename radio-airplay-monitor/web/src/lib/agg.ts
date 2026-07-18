// Pure, synchronous aggregation over the in-memory spin log. At the current scale
// (a few thousand spins, growing slowly) a full scan per keystroke is sub-millisecond,
// so the whole dashboard is driven by re-running these on the filtered set.
import type { Spin } from "./data";

export type Source = "all" | "triton" | "streamb";

export interface Filters {
  term: string;
  station: string; // "all" | station id
  source: Source;
  sinceDays: number | null; // null = all time
}

// Mirrors the collector/build-data artist key: drop a "/ " tail and a featured
// credit, strip punctuation, and a leading "the ", so "Beyoncé feat. Jay-Z" and
// "Beyonce" collapse together for counting.
export function normArtist(input: string): string {
  let s = (input || "").split(" / ")[0];
  s = s.replace(/\s+[([]?(feat\.?|ft\.?|featuring|with|&|x|vs\.?)\s+.*$/i, "");
  s = s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (s.startsWith("the ")) s = s.slice(4);
  return s;
}

export function applyFilters(spins: Spin[], f: Filters, maxAt: number): Spin[] {
  const term = f.term.trim().toLowerCase();
  const cutoff = f.sinceDays != null ? maxAt - f.sinceDays * 86400 : -Infinity;
  return spins.filter((sp) => {
    if (f.station !== "all" && sp.s !== f.station) return false;
    if (f.source !== "all" && sp.src !== f.source) return false;
    if (sp.at < cutoff) return false;
    if (term && !sp.a.toLowerCase().includes(term) && !sp.t.toLowerCase().includes(term))
      return false;
    return true;
  });
}

export interface TimeBucket {
  t: number; // bucket start (unix seconds)
  count: number;
}

// Buckets spins across [start, end] into a continuous series (empty buckets
// included so the x-axis has no gaps). Granularity scales with the span.
export function timeBuckets(spins: Spin[], start: number, end: number): {
  buckets: TimeBucket[];
  stepSec: number;
  unit: "hour" | "day" | "week";
} {
  const spanDays = (end - start) / 86400;
  const unit = spanDays <= 8 ? "hour" : spanDays <= 90 ? "day" : "week";
  const stepSec = unit === "hour" ? 3600 : unit === "day" ? 86400 : 604800;

  const first = Math.floor(start / stepSec) * stepSec;
  const counts = new Map<number, number>();
  for (const sp of spins) {
    const b = Math.floor(sp.at / stepSec) * stepSec;
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  const buckets: TimeBucket[] = [];
  for (let t = first; t <= end; t += stepSec) buckets.push({ t, count: counts.get(t) || 0 });
  return { buckets, stepSec, unit };
}

function bucketing(start: number, end: number) {
  const spanDays = (end - start) / 86400;
  const unit: "hour" | "day" | "week" = spanDays <= 8 ? "hour" : spanDays <= 90 ? "day" : "week";
  const stepSec = unit === "hour" ? 3600 : unit === "day" ? 86400 : 604800;
  return { unit, stepSec };
}

// A stacked time series: one row per bucket carrying a count column per station,
// plus a `partial` flag on the final bucket (the current period hasn't ended, so
// its total is naturally lower — the UI dims it rather than letting it read as a
// drop).
export interface StackRow {
  label: string;
  t: number;
  total: number;
  partial: boolean;
  [stationId: string]: number | string | boolean;
}
export function stationTimeSeries(
  spins: Spin[],
  start: number,
  end: number,
  stationIds: string[],
  fmt: (t: number, unit: "hour" | "day" | "week") => string
): { rows: StackRow[]; unit: "hour" | "day" | "week" } {
  const { unit, stepSec } = bucketing(start, end);
  const first = Math.floor(start / stepSec) * stepSec;
  const lastStart = Math.floor(end / stepSec) * stepSec;
  const byBucket = new Map<number, Map<string, number>>();
  for (const sp of spins) {
    const b = Math.floor(sp.at / stepSec) * stepSec;
    let m = byBucket.get(b);
    if (!m) byBucket.set(b, (m = new Map()));
    m.set(sp.s, (m.get(sp.s) || 0) + 1);
  }
  const rows: StackRow[] = [];
  for (let t = first; t <= end; t += stepSec) {
    const m = byBucket.get(t);
    const row: StackRow = { label: fmt(t, unit), t, total: 0, partial: t === lastStart };
    for (const id of stationIds) {
      const c = m?.get(id) || 0;
      row[id] = c;
      row.total += c;
    }
    rows.push(row);
  }
  return { rows, unit };
}

// Distribution of artist shares across the whole view, for outlier context: a
// selected artist's share can be compared against the field mean ± std dev.
export interface ArtistDist {
  total: number;
  n: number; // distinct artists
  mean: number; // mean share (= 1/n)
  std: number; // std dev of shares
  byKey: Map<string, { display: string; spins: number; share: number }>;
}
export function artistDistribution(spins: Spin[]): ArtistDist {
  const by = new Map<string, { display: string; spins: number }>();
  for (const sp of spins) {
    const k = normArtist(sp.a);
    if (!k) continue;
    const cur = by.get(k) || { display: sp.a, spins: 0 };
    cur.spins++;
    by.set(k, cur);
  }
  const total = spins.length || 1;
  const n = by.size || 1;
  const mean = 1 / n;
  let varSum = 0;
  const byKey = new Map<string, { display: string; spins: number; share: number }>();
  for (const [k, v] of by) {
    const share = v.spins / total;
    varSum += (share - mean) ** 2;
    byKey.set(k, { display: v.display, spins: v.spins, share });
  }
  const std = Math.sqrt(varSum / n);
  return { total, n, mean, std, byKey };
}

export interface ArtistCount {
  artist: string; // display form (most common casing seen)
  spins: number;
}

export function topArtists(spins: Spin[], n: number): ArtistCount[] {
  const by = new Map<string, { display: string; spins: number }>();
  for (const sp of spins) {
    const k = normArtist(sp.a);
    if (!k) continue;
    const cur = by.get(k) || { display: sp.a, spins: 0 };
    cur.spins++;
    by.set(k, cur);
  }
  return [...by.values()]
    .map((v) => ({ artist: v.display, spins: v.spins }))
    .sort((a, b) => b.spins - a.spins)
    .slice(0, n);
}

export interface SongCount {
  song: string; // "Artist — Title" display
  spins: number;
}

export function topSongs(spins: Spin[], n: number): SongCount[] {
  const by = new Map<string, { display: string; spins: number }>();
  for (const sp of spins) {
    const k = normArtist(sp.a) + "|" + sp.t.trim().toLowerCase();
    const cur = by.get(k) || { display: `${sp.a} — ${sp.t}`, spins: 0 };
    cur.spins++;
    by.set(k, cur);
  }
  return [...by.values()]
    .map((v) => ({ song: v.display, spins: v.spins }))
    .sort((a, b) => b.spins - a.spins)
    .slice(0, n);
}

export interface Slice {
  name: string;
  value: number;
  pct: number; // 0..100 of the total passed in
}

// Collapses a ranked list into the top `n` named slices plus an aggregated
// "Other", each carrying its share of `total` — the shape a pie wants.
export function withOther(
  items: { name: string; value: number }[],
  n: number,
  total: number
): Slice[] {
  const top = items.slice(0, n);
  const rest = items.slice(n).reduce((sum, i) => sum + i.value, 0);
  const slices = top.map((i) => ({ ...i, pct: total ? (i.value / total) * 100 : 0 }));
  if (rest > 0) slices.push({ name: "Other", value: rest, pct: total ? (rest / total) * 100 : 0 });
  return slices;
}

export function perStationCounts(
  spins: Spin[],
  stations: { id: string; name: string }[]
): { id: string; name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const sp of spins) counts.set(sp.s, (counts.get(sp.s) || 0) + 1);
  return stations
    .map((st) => ({ id: st.id, name: st.name, value: counts.get(st.id) || 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
}
