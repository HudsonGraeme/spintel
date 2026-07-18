import { Box, Flex, SimpleGrid, Text } from "@chakra-ui/react";
import type { Spin } from "../lib/data";
import { perStationCounts, topArtists, topSongs } from "../lib/agg";
import { SX } from "../lib/ui";

const WEEK = 7 * 86400;

// The hero: a fixed "this week" snapshot (last 7 days, all sources) that leads the
// page with the highest-signal metrics before any filtering. Independent of the
// control bar below.
export function Highlights({
  spins,
  stations,
  maxAt,
}: {
  spins: Spin[];
  stations: { id: string; name: string }[];
  maxAt: number;
}) {
  const since = maxAt - WEEK;
  const week = spins.filter((s) => s.at >= since);

  const songs = topSongs(week, week.length || 1);
  const artists = topArtists(week, week.length || 1);
  const topSongList = songs.slice(0, 5);
  const topArtistList = artists.slice(0, 5);
  const deepCuts = [...songs].reverse().slice(0, 5); // rarest tracks
  const stationTop = perStationCounts(week, stations)[0];

  // peak hour of day
  const hours = new Array(24).fill(0);
  for (const s of week) hours[new Date(s.at * 1000).getHours()]++;
  let peakH = 0;
  for (let h = 1; h < 24; h++) if (hours[h] > hours[peakH]) peakH = h;

  const n1song = topSongList[0];
  const n1artist = topArtistList[0];

  return (
    <Box>
      <Flex align="baseline" gap={3} mb={3}>
        <Text {...eyebrow} color={SX.text}>
          This week
        </Text>
        <Text fontFamily={SX.mono} fontSize="11px" color={SX.faint}>
          last 7 days · {week.length.toLocaleString()} spins
        </Text>
      </Flex>

      {/* hero KPI tiles */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="1px" bg={SX.line} borderWidth="1px" borderColor={SX.line} borderRadius="4px" mb={{ base: 4, md: 6 }}>
        <Hero label="Spins · 7d" value={week.length.toLocaleString()} accent />
        <Hero label="#1 song" value={n1song ? n1song.song.split(" — ").slice(1).join(" — ") || n1song.song : "—"} sub={n1song ? `${n1song.song.split(" — ")[0]} · ${n1song.spins}×` : ""} />
        <Hero label="#1 artist" value={n1artist ? n1artist.artist : "—"} sub={n1artist ? `${n1artist.spins} spins` : ""} />
        <Hero label="Peak hour" value={`${String(peakH).padStart(2, "0")}:00`} sub={`${hours[peakH]} spins · ${stationTop ? stationTop.name : "—"} busiest`} />
      </SimpleGrid>

      {/* leaderboards */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 4, md: 6 }}>
        <Board title="Top songs" items={topSongList.map((s) => ({ label: s.song.split(" — ").slice(1).join(" — ") || s.song, sub: s.song.split(" — ")[0], value: s.spins }))} />
        <Board title="Top artists" items={topArtistList.map((a) => ({ label: a.artist, value: a.spins }))} />
        <Board title="Deep cuts · rarest" items={deepCuts.map((s) => ({ label: s.song.split(" — ").slice(1).join(" — ") || s.song, sub: s.song.split(" — ")[0], value: s.spins }))} muted />
      </SimpleGrid>
    </Box>
  );
}

const eyebrow = {
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  fontSize: "11px",
  fontWeight: 600,
  color: SX.dim,
};

function Hero({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Box bg={SX.panel} px={{ base: 3, md: 4 }} py={3} minW={0} _hover={{ bg: SX.panelHi }}>
      <Text textTransform="uppercase" letterSpacing="0.1em" fontSize="11px" color={SX.dim}>
        {label}
      </Text>
      <Text fontFamily={SX.mono} fontSize={{ base: "16px", md: "19px" }} fontWeight={600} color={accent ? SX.accent : SX.text} noOfLines={1} lineHeight="1.35">
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

function Board({ title, items, muted }: { title: string; items: { label: string; sub?: string; value: number }[]; muted?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Box bg={SX.panel} borderWidth="1px" borderColor={SX.line} borderRadius="4px" p={{ base: 3, md: 4 }} minW={0}>
      <Text {...eyebrow} color={SX.text} mb={3}>
        {title}
      </Text>
      <Box>
        {items.map((it, i) => (
          <Flex key={`${it.label}-${i}`} align="center" gap={3} py={2} borderTopWidth={i ? "1px" : 0} borderColor={SX.line}>
            <Text fontFamily={SX.mono} fontSize="12px" color={SX.faint} w="18px">
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Box minW={0} flex="1">
              <Text color={SX.text} fontSize="13px" noOfLines={1}>
                {it.label}
              </Text>
              {it.sub && (
                <Text fontFamily={SX.mono} fontSize="10px" color={SX.faint} noOfLines={1}>
                  {it.sub}
                </Text>
              )}
              <Box mt="4px" h="4px" bg={SX.line} borderRadius="full" overflow="hidden">
                <Box h="100%" w={`${(it.value / max) * 100}%`} bg={muted ? SX.faint : SX.accent} />
              </Box>
            </Box>
            <Text fontFamily={SX.mono} fontSize="13px" color={SX.text} minW="34px" textAlign="right">
              {it.value}
            </Text>
          </Flex>
        ))}
        {!items.length && (
          <Text fontFamily={SX.mono} fontSize="12px" color={SX.faint}>
            —
          </Text>
        )}
      </Box>
    </Box>
  );
}
