import { Box, Flex, SimpleGrid, Text } from "@chakra-ui/react";
import type { Feed } from "../lib/data";
import { SX, statusColor } from "../lib/ui";

function ago(sec: number): string {
  if (!sec || sec < 0) return "—";
  if (sec < 90) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 90) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function FeedHealth({ feeds, refAt }: { feeds: Feed[]; refAt: number }) {
  const up = feeds.filter((f) => f.status === "ok").length;
  return (
    <Box>
      <Flex align="baseline" gap={3} mb={3}>
        <Text {...labelStyle}>Feed health</Text>
        <Text fontFamily={SX.mono} fontSize="11px" color={up === feeds.length ? SX.ok : SX.warn}>
          {up}/{feeds.length} nominal
        </Text>
      </Flex>
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing="1px" bg={SX.line} borderWidth="1px" borderColor={SX.line} borderRadius="4px">
        {feeds.map((f) => (
          <FeedTile key={f.id} f={f} refAt={refAt} />
        ))}
      </SimpleGrid>
    </Box>
  );
}

const labelStyle = {
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  fontSize: "11px",
  fontWeight: 600,
  color: SX.dim,
};

function FeedTile({ f, refAt }: { f: Feed; refAt: number }) {
  const c = statusColor[f.status] ?? SX.faint;
  return (
    <Box bg={SX.panel} px={{ base: 3, md: 4 }} py={3} _hover={{ bg: SX.panelHi }}>
      <Flex align="center" gap={2} mb={1}>
        <Box w="6px" h="6px" borderRadius="full" bg={c} flexShrink={0} />
        <Text fontWeight={600} color={SX.text} fontSize={{ base: "13px", md: "14px" }} noOfLines={1}>
          {f.name}
        </Text>
        <Text
          ml="auto"
          fontFamily={SX.mono}
          fontSize="11px"
          textTransform="uppercase"
          letterSpacing="0.08em"
          color={c}
        >
          {f.status}
        </Text>
      </Flex>
      <Flex fontFamily={SX.mono} fontSize="11px" color={SX.dim} gap={3} flexWrap="wrap">
        <Text>{f.market}</Text>
        <Text color={SX.faint}>·</Text>
        <Text>{f.adapter}</Text>
        <Text color={SX.faint}>·</Text>
        <Text>{f.spins.toLocaleString()} spins</Text>
        <Text ml="auto" color={SX.faint}>
          last {ago(refAt - f.lastSpinAt)}
        </Text>
      </Flex>
    </Box>
  );
}
