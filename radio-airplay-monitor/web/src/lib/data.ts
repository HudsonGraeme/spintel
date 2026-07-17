import { create, insertMultiple, search, type Orama } from "@orama/orama";

export interface Spin {
  s: string;
  a: string;
  t: string;
  at: number;
  src: string;
}
export interface Station {
  id: string;
  name: string;
  market: string;
  owner: string;
  format: string;
  adapter: string;
}
export interface Meta {
  generatedAt: string;
  totalSpins: number;
  stationCount: number;
  artistCount: number;
  dateRange: [number, number] | null;
  perStation: { id: string; name: string; spins: number }[];
  topArtists: { norm: string; artist: string; spins: number }[];
}

const schema = {
  s: "string",
  a: "string",
  t: "string",
  at: "number",
  src: "string",
} as const;

export interface Dataset {
  spins: Spin[];
  stations: Station[];
  meta: Meta;
  db: Orama<typeof schema>;
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function loadDataset(): Promise<Dataset> {
  // BASE_URL is "/" in dev and "/airmon/" for the GitHub Pages subpath build, so
  // data URLs resolve correctly under either.
  const base = import.meta.env.BASE_URL;
  const [spins, stations, meta] = await Promise.all([
    getJSON<Spin[]>(`${base}data/spins.json`),
    getJSON<Station[]>(`${base}data/stations.json`),
    getJSON<Meta>(`${base}data/meta.json`),
  ]);
  const db = await create({ schema });
  if (spins.length) await insertMultiple(db, spins as never[], 500);
  return { spins, stations, meta, db };
}

export interface Query {
  term: string;
  station: string; // "all" or a station id
  limit?: number;
}

export async function searchSpins(db: Dataset["db"], q: Query): Promise<Spin[]> {
  const where = q.station && q.station !== "all" ? { s: q.station } : undefined;
  const sortBy = { property: "at", order: "DESC" } as const;
  const limit = q.limit ?? 200;
  // Orama returns nothing for an empty term when `properties` is set, so only
  // scope to fields when there is an actual query; an empty term matches all.
  const res = q.term
    ? await search(db, { term: q.term, properties: ["a", "t"], where, sortBy, limit })
    : await search(db, { term: "", where, sortBy, limit });
  return res.hits.map((h) => h.document as Spin);
}
