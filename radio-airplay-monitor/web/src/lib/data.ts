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

export interface Dataset {
  spins: Spin[];
  stations: Station[];
  meta: Meta;
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function loadDataset(): Promise<Dataset> {
  // BASE_URL is "/" in dev and the GitHub Pages subpath in production, so data
  // URLs resolve correctly under either.
  const base = import.meta.env.BASE_URL;
  const [spins, stations, meta] = await Promise.all([
    getJSON<Spin[]>(`${base}data/spins.json`),
    getJSON<Station[]>(`${base}data/stations.json`),
    getJSON<Meta>(`${base}data/meta.json`),
  ]);
  spins.sort((a, b) => a.at - b.at);
  return { spins, stations, meta };
}
