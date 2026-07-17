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
