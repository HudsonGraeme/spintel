import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  Input,
  Link,
  Select,
  SimpleGrid,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { loadDataset, type Dataset } from "./lib/data";
import {
  applyFilters,
  artistDistribution,
  normArtist,
  perStationCounts,
  stationTimeSeries,
  topArtists,
  topSongs,
  type Filters,
  type Slice,
  type Source,
} from "./lib/agg";
import { useViz } from "./lib/viz";
import { SX } from "./lib/ui";
import { SharePie, TimelineBars, TopArtistsBar } from "./components/charts";
import { FeedHealth } from "./components/FeedHealth";
import { DataGrid } from "./components/DataGrid";
import { Compare } from "./components/Compare";
import { Highlights } from "./components/Highlights";

const DOC_URL =
  "https://github.com/HudsonGraeme/airmon/tree/main/radio-airplay-monitor#adding-a-station";

const WINDOWS: { label: string; days: number | null }[] = [
  { label: "24H", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "ALL", days: null },
];

function mixSlices(items: { name: string; value: number }[]): Slice[] {
  const total = items.reduce((n, i) => n + i.value, 0);
  return items.map((i) => ({ name: i.name, value: i.value, pct: total ? (i.value / total) * 100 : 0 }));
}

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadDataset().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error)
    return (
      <Container maxW="7xl" py={20}>
        <Alert status="error" rounded="md" bg={SX.panel} color={SX.text} borderWidth="1px" borderColor={SX.down}>
          <AlertIcon color={SX.down} />
          Failed to load data: {error}
        </Alert>
      </Container>
    );

  if (!data)
    return (
      <Flex h="100vh" align="center" justify="center" direction="column" gap={4} bg={SX.page}>
        <Spinner size="lg" color={SX.accent} thickness="2px" />
        <Text fontFamily={SX.mono} fontSize="sm" color={SX.dim} letterSpacing="0.1em">
          LOADING TELEMETRY…
        </Text>
      </Flex>
    );

  return <Dashboard data={data} />;
}

// --- shared styling helpers -------------------------------------------------

const eyebrow = {
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  fontSize: "11px",
  fontWeight: 600,
  color: SX.dim,
};

const fieldSx = {
  bg: SX.panel,
  borderColor: SX.line,
  color: SX.text,
  fontFamily: SX.mono,
  fontSize: "13px",
  borderRadius: "4px",
  _hover: { borderColor: SX.lineHi },
  _focusVisible: { borderColor: SX.accent, boxShadow: "none" },
};

function Dashboard({ data }: { data: Dataset }) {
  const viz = useViz();
  const [term, setTerm] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [win, setWin] = useState(3); // default ALL
  const [focus, setFocus] = useState("all");
  const [compare, setCompare] = useState<string[]>([]);
  const toggleCompare = (a: string) =>
    setCompare((c) => (c.includes(a) ? c.filter((x) => x !== a) : [...c, a]));

  const maxAt = data.meta.dateRange ? data.meta.dateRange[1] : 0;
  const minAt = data.meta.dateRange ? data.meta.dateRange[0] : 0;
  const sinceDays = WINDOWS[win].days;

  const nameToId = useMemo(() => new Map(data.stations.map((s) => [s.name, s.id])), [data.stations]);
  const idToName = useMemo(() => new Map(data.stations.map((s) => [s.id, s.name])), [data.stations]);

  const baseFilters: Filters = { term, station: focus, source, sinceDays };
  const scoped = useMemo(
    () => applyFilters(data.spins, baseFilters, maxAt),
    [data.spins, term, source, sinceDays, focus, maxAt]
  );
  const acrossStations = useMemo(
    () => applyFilters(data.spins, { term, station: "all", source, sinceDays }, maxAt),
    [data.spins, term, source, sinceDays, maxAt]
  );

  const { stackRows, timeUnit } = useMemo(() => {
    const start = sinceDays != null ? Math.max(minAt, maxAt - sinceDays * 86400) : minAt;
    const fmt = (t: number, unit: "hour" | "day" | "week") =>
      unit === "hour"
        ? new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
        : new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const { rows, unit } = stationTimeSeries(scoped, start, maxAt, data.stations.map((s) => s.id), fmt);
    return { stackRows: rows, timeUnit: unit };
  }, [scoped, sinceDays, minAt, maxAt, data.stations]);

  const artistBars = useMemo(() => topArtists(scoped, 12), [scoped]);
  const dist = useMemo(() => artistDistribution(scoped), [scoped]);
  const compareSel = useMemo(() => new Set(compare), [compare]);
  const artistPie = useMemo(
    () => mixSlices(topArtists(scoped, 6).map((a) => ({ name: a.artist, value: a.spins }))),
    [scoped]
  );
  const songPie = useMemo(
    () => mixSlices(topSongs(scoped, 6).map((s) => ({ name: s.song, value: s.spins }))),
    [scoped]
  );
  const stationPie: Slice[] = useMemo(() => {
    const counts = perStationCounts(acrossStations, data.stations);
    const total = counts.reduce((n, c) => n + c.value, 0);
    return counts.map((c) => ({ name: c.name, value: c.value, pct: total ? (c.value / total) * 100 : 0 }));
  }, [acrossStations, data.stations]);

  const stats = useMemo(() => {
    const artists = new Set(scoped.map((s) => normArtist(s.a))).size;
    const stationsActive = new Set(scoped.map((s) => s.s)).size;
    return { spins: scoped.length, artists, stationsActive };
  }, [scoped]);

  const stationName = useMemo(() => (id: string) => idToName.get(id) ?? id, [idToName]);
  const feeds = data.meta.feeds ?? [];
  const healthRef = data.meta.healthRef || maxAt;

  return (
    <Box minH="100vh" bg={SX.page} overflowX="hidden">
      <Header />
      <Container maxW="7xl" py={{ base: 5, md: 7 }} px={{ base: 3, md: 6 }}>
        <VStack align="stretch" spacing={{ base: 6, md: 8 }}>
          <Section>
            <Highlights spins={data.spins} stations={data.stations} maxAt={maxAt} />
          </Section>

          {/* control bar */}
          <Flex gap={3} flexWrap="wrap" align="center">
            <Input
              placeholder="SEARCH ARTIST / TITLE"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              maxW="xs"
              size="sm"
              sx={fieldSx}
              _placeholder={{ color: SX.faint, letterSpacing: "0.06em" }}
            />
            <Select value={source} onChange={(e) => setSource(e.target.value as Source)} maxW="40" size="sm" sx={fieldSx}>
              <option value="all">ALL SOURCES</option>
              <option value="triton">TRITON</option>
              <option value="streamb">STREAMB</option>
            </Select>
            <HStack spacing={0} borderWidth="1px" borderColor={SX.line} borderRadius="4px" overflow="hidden">
              {WINDOWS.map((w, i) => (
                <Box
                  key={w.label}
                  as="button"
                  px={3}
                  py="6px"
                  fontFamily={SX.mono}
                  fontSize="12px"
                  letterSpacing="0.06em"
                  color={i === win ? SX.page : SX.dim}
                  bg={i === win ? SX.accent : "transparent"}
                  _hover={i === win ? {} : { color: SX.text, bg: SX.panelHi }}
                  borderLeftWidth={i ? "1px" : 0}
                  borderColor={SX.line}
                  onClick={() => setWin(i)}
                >
                  {w.label}
                </Box>
              ))}
            </HStack>
            {focus !== "all" && (
              <Box
                as="button"
                onClick={() => setFocus("all")}
                px={3}
                py="6px"
                borderWidth="1px"
                borderColor={SX.accent}
                borderRadius="4px"
                color={SX.accent}
                fontFamily={SX.mono}
                fontSize="12px"
                _hover={{ bg: "rgba(75,156,255,0.1)" }}
              >
                {idToName.get(focus) ?? focus} ✕
              </Box>
            )}
            <Text ml="auto" fontFamily={SX.mono} fontSize="12px" color={SX.dim}>
              {stats.spins.toLocaleString()} SPINS
            </Text>
          </Flex>

          {/* stat tiles */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing="1px" bg={SX.line} borderWidth="1px" borderColor={SX.line} borderRadius="4px">
            <StatTile label="Spins" value={stats.spins.toLocaleString()} accent />
            <StatTile label="Artists" value={stats.artists.toLocaleString()} />
            <StatTile label="Stations active" value={String(stats.stationsActive)} />
            <StatTile label="Window" value={WINDOWS[win].label} sub={`updated ${new Date(data.meta.generatedAt).toLocaleString()}`} />
          </SimpleGrid>

          <Panel title="Airplay over time" sub={`stacked by station · spins per ${timeUnit} · current period dimmed`}>
            {scoped.length ? <TimelineBars rows={stackRows} stations={data.stations} viz={viz} /> : <Empty />}
          </Panel>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
            <Panel title="Top artists" sub="click a bar to compare">
              {artistBars.length ? (
                <TopArtistsBar data={artistBars} viz={viz} selected={compareSel} onToggle={toggleCompare} />
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="Spins by station" sub="click a slice to drill in">
              {stationPie.length ? (
                <SharePie data={stationPie} viz={viz} onSlice={(name) => setFocus(nameToId.get(name) ?? "all")} />
              ) : (
                <Empty />
              )}
            </Panel>
          </SimpleGrid>

          {compare.length > 0 && (
            <Compare
              selected={compare}
              dist={dist}
              onRemove={toggleCompare}
              onClear={() => setCompare([])}
            />
          )}

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
            <Panel title="Artist mix" sub={`top 6${focus !== "all" ? ` · ${idToName.get(focus)}` : ""}`}>
              {artistPie.length ? <SharePie data={artistPie} viz={viz} /> : <Empty />}
            </Panel>
            <Panel title="Song mix" sub={`top 6${focus !== "all" ? ` · ${idToName.get(focus)}` : ""}`}>
              {songPie.length ? <SharePie data={songPie} viz={viz} /> : <Empty />}
            </Panel>
          </SimpleGrid>

          {feeds.length > 0 && (
            <Section>
              <FeedHealth feeds={feeds} refAt={healthRef} />
            </Section>
          )}

          <Section>
            <Flex align="baseline" gap={3} mb={3}>
              <Text {...eyebrow}>Spin log</Text>
              <Text fontFamily={SX.mono} fontSize="11px" color={SX.faint}>
                sortable · {scoped.length.toLocaleString()} rows
              </Text>
            </Flex>
            <DataGrid rows={scoped} stationName={stationName} />
          </Section>
        </VStack>
      </Container>
      <Footer />
    </Box>
  );
}

function Header() {
  return (
    <Box as="header" borderBottomWidth="1px" borderColor={SX.line} bg={SX.page} position="sticky" top={0} zIndex={20} backdropFilter="blur(6px)">
      <Container maxW="7xl" py={{ base: 3, md: 4 }} px={{ base: 3, md: 6 }}>
        <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
          <Flex align="center" gap={2.5}>
            <Box w="6px" h="6px" borderRadius="full" bg={SX.accent} />
            <Box>
              <Heading fontSize={{ base: "15px", md: "18px" }} letterSpacing={{ base: "0.18em", md: "0.28em" }} fontWeight={700}>
                AIRMON
              </Heading>
              <Text fontFamily={SX.mono} fontSize="11px" color={SX.dim} letterSpacing="0.12em">
                CANADIAN RADIO AIRPLAY · TELEMETRY
              </Text>
            </Box>
          </Flex>
          <HStack spacing={3}>
            <Text fontFamily={SX.mono} fontSize="11px" color={SX.faint} letterSpacing="0.1em" display={{ base: "none", md: "block" }}>
              CC0 · METADATA-ONLY
            </Text>
            <Button
              as="a"
              href={DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              bg={SX.accent}
              color={SX.page}
              fontFamily={SX.mono}
              fontSize={{ base: "11px", md: "12px" }}
              letterSpacing="0.06em"
              borderRadius="4px"
              _hover={{ bg: "#63acff" }}
            >
              + ADD FEED
            </Button>
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <Box>{children}</Box>;
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Box bg={SX.panel} borderWidth="1px" borderColor={SX.line} borderRadius="4px" p={{ base: 3, md: 4 }} minW={0} overflow="hidden">
      <Flex align="baseline" gap={2} mb={3} flexWrap="wrap">
        <Text {...eyebrow} color={SX.text}>
          {title}
        </Text>
        {sub && (
          <Text fontFamily={SX.mono} fontSize="11px" color={SX.faint}>
            {sub}
          </Text>
        )}
      </Flex>
      {children}
    </Box>
  );
}

function Empty() {
  return (
    <Flex h="200px" align="center" justify="center" color={SX.faint} fontFamily={SX.mono} fontSize="sm">
      NO DATA
    </Flex>
  );
}

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Box bg={SX.panel} px={{ base: 3, md: 4 }} py={3} _hover={{ bg: SX.panelHi }}>
      <Text textTransform="uppercase" letterSpacing="0.1em" fontSize="11px" color={SX.dim}>
        {label}
      </Text>
      <Text fontFamily={SX.mono} fontSize={{ base: "19px", md: "26px" }} fontWeight={600} color={accent ? SX.accent : SX.text} lineHeight="1.25">
        {value}
      </Text>
      {sub && (
        <Text fontFamily={SX.mono} fontSize="11px" color={SX.faint} noOfLines={1}>
          {sub}
        </Text>
      )}
    </Box>
  );
}

function Footer() {
  return (
    <Box borderTopWidth="1px" borderColor={SX.line} mt={10}>
      <Container maxW="7xl" py={6}>
        <Text fontFamily={SX.mono} fontSize="11px" color={SX.faint} lineHeight="1.7">
          AIRMON publishes open airplay facts — what played, when, on which station — so anyone can
          verify them independently. No audio is recorded or served.{" "}
          <Link href="https://github.com/HudsonGraeme/airmon/tree/main/radio-airplay-monitor" color={SX.accent} isExternal>
            SOURCE
          </Link>
        </Text>
      </Container>
    </Box>
  );
}
