import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
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
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  Table,
  TableContainer,
  Tag,
  TagCloseButton,
  TagLabel,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useColorMode,
  useColorModeValue,
} from "@chakra-ui/react";
import { loadDataset, type Dataset, type Spin } from "./lib/data";
import {
  applyFilters,
  normArtist,
  perStationCounts,
  timeBuckets,
  topArtists,
  topSongs,
  type Filters,
  type Slice,
  type Source,
} from "./lib/agg";

// Turn a ranked list into pie slices whose pct is the share among the listed
// leaders (the group sums to 100%). Used for the "mix" pies, which show how the
// top artists/songs stack up against each other rather than against the diffuse
// long tail.
function mixSlices(items: { name: string; value: number }[]): Slice[] {
  const total = items.reduce((n, i) => n + i.value, 0);
  return items.map((i) => ({ name: i.name, value: i.value, pct: total ? (i.value / total) * 100 : 0 }));
}
import { useViz } from "./lib/viz";
import { SharePie, TimelineArea, TopArtistsBar, type TimePoint } from "./components/charts";

const fmtTime = (at: number) =>
  new Date(at * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const WINDOWS: { label: string; days: number | null }[] = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "All", days: null },
];

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadDataset().then(setData).catch((e) => setError(String(e)));
  }, []);

  const subtle = useColorModeValue("gray.600", "gray.400");

  if (error)
    return (
      <Container maxW="6xl" py={20}>
        <Alert status="error" rounded="md">
          <AlertIcon />
          Failed to load data: {error}. Run <code>&nbsp;pnpm data&nbsp;</code> first.
        </Alert>
      </Container>
    );

  if (!data)
    return (
      <Flex h="100vh" align="center" justify="center" direction="column" gap={4}>
        <Spinner size="xl" color="brand.400" thickness="3px" />
        <Text color={subtle}>loading airplay data…</Text>
      </Flex>
    );

  return <Dashboard data={data} />;
}

function Dashboard({ data }: { data: Dataset }) {
  const viz = useViz();
  const [term, setTerm] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [win, setWin] = useState(1); // index into WINDOWS; default 24h
  const [focus, setFocus] = useState("all"); // station id or "all"

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.600", "gray.400");

  const maxAt = data.meta.dateRange ? data.meta.dateRange[1] : 0;
  const minAt = data.meta.dateRange ? data.meta.dateRange[0] : 0;
  const sinceDays = WINDOWS[win].days;

  const nameToId = useMemo(
    () => new Map(data.stations.map((s) => [s.name, s.id])),
    [data.stations]
  );
  const idToName = useMemo(
    () => new Map(data.stations.map((s) => [s.id, s.name])),
    [data.stations]
  );

  // Scoped set drives everything except the station-comparison pie: term + source
  // + time window + the focused station (the drill target).
  const baseFilters: Filters = { term, station: focus, source, sinceDays };
  const scoped = useMemo(
    () => applyFilters(data.spins, baseFilters, maxAt),
    [data.spins, term, source, sinceDays, focus, maxAt]
  );
  // Station pie ignores the focused station so you can always see and click across
  // stations to drill in.
  const acrossStations = useMemo(
    () => applyFilters(data.spins, { term, station: "all", source, sinceDays }, maxAt),
    [data.spins, term, source, sinceDays, maxAt]
  );

  const { timeline, timeUnit } = useMemo(() => {
    const start = sinceDays != null ? Math.max(minAt, maxAt - sinceDays * 86400) : minAt;
    const { buckets, unit } = timeBuckets(scoped, start, maxAt);
    const fmt = (t: number) =>
      unit === "hour"
        ? new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
        : new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const points: TimePoint[] = buckets.map((b) => ({ label: fmt(b.t), count: b.count }));
    return { timeline: points, timeUnit: unit };
  }, [scoped, sinceDays, minAt, maxAt]);

  const artistBars = useMemo(() => topArtists(scoped, 12), [scoped]);
  const artistPie: Slice[] = useMemo(
    () => mixSlices(topArtists(scoped, 6).map((a) => ({ name: a.artist, value: a.spins }))),
    [scoped]
  );
  const songPie: Slice[] = useMemo(
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

  const windowDays = maxAt && minAt ? (maxAt - minAt) / 86400 : 0;

  return (
    <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.900")}>
      <Header />
      <Container maxW="6xl" py={8}>
        <VStack align="stretch" spacing={6}>
          {windowDays < 7 && (
            <Alert status="info" rounded="md" fontSize="sm">
              <AlertIcon />
              Only {windowDays.toFixed(1)} days of data so far — early aggregates are a small
              sample and will settle as the log grows.
            </Alert>
          )}

          {/* filters */}
          <Flex gap={3} flexWrap="wrap" align="center">
            <Input
              placeholder="search artist or title…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              maxW="xs"
              bg={cardBg}
              borderColor={border}
            />
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              maxW="44"
              bg={cardBg}
              borderColor={border}
            >
              <option value="all">All sources</option>
              <option value="triton">Triton</option>
              <option value="streamb">StreamB</option>
            </Select>
            <HStack spacing={1} bg={cardBg} borderWidth="1px" borderColor={border} rounded="md" p={1}>
              {WINDOWS.map((w, i) => (
                <Button
                  key={w.label}
                  size="sm"
                  variant={i === win ? "solid" : "ghost"}
                  colorScheme={i === win ? "blue" : "gray"}
                  onClick={() => setWin(i)}
                >
                  {w.label}
                </Button>
              ))}
            </HStack>
            {focus !== "all" && (
              <Tag colorScheme="blue" size="lg" rounded="full">
                <TagLabel>{idToName.get(focus) ?? focus}</TagLabel>
                <TagCloseButton onClick={() => setFocus("all")} />
              </Tag>
            )}
            <Text color={subtle} fontSize="sm" ml="auto">
              {stats.spins.toLocaleString()} spins match
            </Text>
          </Flex>

          {/* stat cards */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
            <StatCard label="Spins" value={stats.spins.toLocaleString()} cardBg={cardBg} border={border} accent />
            <StatCard label="Artists" value={stats.artists.toLocaleString()} cardBg={cardBg} border={border} />
            <StatCard label="Stations active" value={String(stats.stationsActive)} cardBg={cardBg} border={border} />
            <StatCard label="Window" value={WINDOWS[win].label} help={`updated ${new Date(data.meta.generatedAt).toLocaleString()}`} cardBg={cardBg} border={border} />
          </SimpleGrid>

          <ChartCard title="Airplay over time" subtitle={`spins per ${timeUnit}`} cardBg={cardBg} border={border} subtle={subtle}>
            {scoped.length ? <TimelineArea data={timeline} viz={viz} unit={timeUnit} /> : <Empty subtle={subtle} />}
          </ChartCard>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
            <ChartCard title="Top artists" subtitle="most-played in view" cardBg={cardBg} border={border} subtle={subtle}>
              {artistBars.length ? <TopArtistsBar data={artistBars} viz={viz} /> : <Empty subtle={subtle} />}
            </ChartCard>
            <ChartCard title="Spins by station" subtitle="click a slice to drill in" cardBg={cardBg} border={border} subtle={subtle}>
              {stationPie.length ? (
                <SharePie data={stationPie} viz={viz} onSlice={(name) => setFocus(nameToId.get(name) ?? "all")} />
              ) : (
                <Empty subtle={subtle} />
              )}
            </ChartCard>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
            <ChartCard
              title="Artist mix"
              subtitle={`top 6 · share among leaders${focus !== "all" ? ` · ${idToName.get(focus)}` : ""}`}
              cardBg={cardBg}
              border={border}
              subtle={subtle}
            >
              {artistPie.length ? <SharePie data={artistPie} viz={viz} /> : <Empty subtle={subtle} />}
            </ChartCard>
            <ChartCard
              title="Song mix"
              subtitle={`top 6 · share among leaders${focus !== "all" ? ` · ${idToName.get(focus)}` : ""}`}
              cardBg={cardBg}
              border={border}
              subtle={subtle}
            >
              {songPie.length ? <SharePie data={songPie} viz={viz} /> : <Empty subtle={subtle} />}
            </ChartCard>
          </SimpleGrid>

          <ChartCard title="Spins" subtitle={`newest first · showing ${Math.min(scoped.length, 300)} of ${scoped.length.toLocaleString()}`} cardBg={cardBg} border={border} subtle={subtle}>
            <ResultsTable results={scoped} idToName={idToName} border={border} subtle={subtle} />
          </ChartCard>
        </VStack>
      </Container>
      <Footer subtle={subtle} border={border} />
    </Box>
  );
}

function Header() {
  const { colorMode, toggleColorMode } = useColorMode();
  const border = useColorModeValue("gray.200", "gray.700");
  const bg = useColorModeValue("white", "gray.800");
  return (
    <Box as="header" borderBottomWidth="1px" borderColor={border} bg={bg} position="sticky" top={0} zIndex={10}>
      <Container maxW="6xl" py={4}>
        <Flex align="center" justify="space-between" gap={4} flexWrap="wrap">
          <Box>
            <Heading size="md" letterSpacing="-0.02em">
              airmon
            </Heading>
            <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.400")}>
              open Canadian radio airplay — facts, not audio
            </Text>
          </Box>
          <HStack spacing={2}>
            <Badge colorScheme="blue" variant="subtle">CC0</Badge>
            <Badge colorScheme="green" variant="subtle">metadata-only</Badge>
            <Button size="sm" variant="ghost" onClick={toggleColorMode}>
              {colorMode === "light" ? "🌙" : "☀️"}
            </Button>
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}

function ChartCard({
  title,
  subtitle,
  cardBg,
  border,
  subtle,
  children,
}: {
  title: string;
  subtitle?: string;
  cardBg: string;
  border: string;
  subtle: string;
  children: React.ReactNode;
}) {
  return (
    <Box bg={cardBg} borderWidth="1px" borderColor={border} rounded="lg" p={4}>
      <Flex align="baseline" gap={2} mb={3} flexWrap="wrap">
        <Heading size="sm">{title}</Heading>
        {subtitle && (
          <Text fontSize="xs" color={subtle}>
            {subtitle}
          </Text>
        )}
      </Flex>
      {children}
    </Box>
  );
}

function Empty({ subtle }: { subtle: string }) {
  return (
    <Flex h="200px" align="center" justify="center" color={subtle} fontSize="sm">
      No spins match.
    </Flex>
  );
}

function StatCard(props: {
  label: string;
  value: string;
  help?: string;
  cardBg: string;
  border: string;
  accent?: boolean;
}) {
  return (
    <Stat px={4} py={3} bg={props.cardBg} borderWidth="1px" borderColor={props.accent ? "brand.400" : props.border} rounded="lg">
      <StatLabel fontSize="xs" color="gray.500">{props.label}</StatLabel>
      <StatNumber fontSize="2xl" color={props.accent ? "brand.400" : undefined}>{props.value}</StatNumber>
      {props.help && <StatHelpText fontSize="xs" mb={0} noOfLines={1}>{props.help}</StatHelpText>}
    </Stat>
  );
}

function ResultsTable({
  results,
  idToName,
  border,
  subtle,
}: {
  results: Spin[];
  idToName: Map<string, string>;
  border: string;
  subtle: string;
}) {
  const rows = useMemo(() => [...results].reverse().slice(0, 300), [results]);
  if (!rows.length) return <Empty subtle={subtle} />;
  return (
    <TableContainer borderWidth="1px" borderColor={border} rounded="lg">
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Time</Th>
            <Th>Station</Th>
            <Th>Artist</Th>
            <Th>Title</Th>
            <Th>Src</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((sp, i) => (
            <Tr key={`${sp.s}-${sp.at}-${i}`}>
              <Td color={subtle} whiteSpace="nowrap">{fmtTime(sp.at)}</Td>
              <Td whiteSpace="nowrap">{idToName.get(sp.s) ?? sp.s}</Td>
              <Td fontWeight="medium">{sp.a}</Td>
              <Td>{sp.t}</Td>
              <Td>
                <Badge variant="subtle" colorScheme={sp.src === "triton" ? "blue" : "purple"}>
                  {sp.src}
                </Badge>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}

function Footer({ subtle, border }: { subtle: string; border: string }) {
  return (
    <Box borderTopWidth="1px" borderColor={border} mt={8}>
      <Container maxW="6xl" py={6}>
        <Text fontSize="xs" color={subtle}>
          airmon publishes open airplay <b>facts</b> — what played, when, on which station — so
          anyone can verify them independently. No audio is recorded or served, and the dataset
          takes no editorial position.{" "}
          <Link href="https://github.com/HudsonGraeme/airmon/tree/main/radio-airplay-monitor" color="brand.400" isExternal>
            Source
          </Link>
          .
        </Text>
      </Container>
    </Box>
  );
}
