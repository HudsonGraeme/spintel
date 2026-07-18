import { Box, Flex, Text } from "@chakra-ui/react";
import { normArtist, type ArtistDist } from "../lib/agg";
import { SX } from "../lib/ui";

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

// Compares the selected artists against the whole-view field: each artist's share
// of spins, and how far that share sits from the field mean in std devs (σ). |z|≥2
// is flagged as an outlier. Answers "is this artist's share unusually high?" and
// "how do these N artists stack up?".
export function Compare({
  selected,
  dist,
  onRemove,
  onClear,
}: {
  selected: string[];
  dist: ArtistDist;
  onRemove: (artist: string) => void;
  onClear: () => void;
}) {
  const rows = selected.map((name) => {
    const e = dist.byKey.get(normArtist(name));
    const share = e?.share ?? 0;
    const spins = e?.spins ?? 0;
    const z = dist.std > 0 ? (share - dist.mean) / dist.std : 0;
    return { name, spins, share, z };
  });
  const maxShare = Math.max(dist.mean * 4, ...rows.map((r) => r.share), 1e-9);

  return (
    <Box bg={SX.panel} borderWidth="1px" borderColor={SX.line} borderRadius="4px" p={{ base: 3, md: 4 }}>
      <Flex align="baseline" gap={2} mb={1} flexWrap="wrap">
        <Text textTransform="uppercase" letterSpacing="0.14em" fontSize="11px" fontWeight={600} color={SX.text}>
          Compare
        </Text>
        <Text fontFamily={SX.mono} fontSize="11px" color={SX.faint}>
          share vs field · mean {pct(dist.mean)} ± {pct(dist.std)} over {dist.n.toLocaleString()} artists
        </Text>
        <Box as="button" ml="auto" onClick={onClear} fontFamily={SX.mono} fontSize="11px" color={SX.faint} _hover={{ color: SX.text }}>
          CLEAR
        </Box>
      </Flex>

      {/* header row */}
      <Box display="grid" gridTemplateColumns="minmax(120px,1.4fr) 64px 88px minmax(90px,1fr) 70px" gap={2} py={2} borderBottomWidth="1px" borderColor={SX.line}>
        {["Artist", "Spins", "Share", "vs field", ""].map((h, i) => (
          <Text key={h || i} fontFamily={SX.mono} fontSize="10px" textTransform="uppercase" letterSpacing="0.08em" color={SX.dim} textAlign={i === 1 || i === 2 ? "right" : "left"}>
            {h}
          </Text>
        ))}
      </Box>

      {rows.map((r) => {
        const outlier = Math.abs(r.z) >= 2;
        const zColor = r.z >= 2 ? SX.ok : r.z <= -2 ? SX.down : SX.dim;
        return (
          <Box key={r.name} display="grid" gridTemplateColumns="minmax(120px,1.4fr) 64px 88px minmax(90px,1fr) 70px" gap={2} py={2} alignItems="center" borderBottomWidth="1px" borderColor={SX.line} _hover={{ bg: SX.panelHi }}>
            <Text color={SX.text} fontSize="13px" noOfLines={1}>
              {r.name}
            </Text>
            <Text fontFamily={SX.mono} fontSize="12px" color={SX.dim} textAlign="right">
              {r.spins.toLocaleString()}
            </Text>
            <Text fontFamily={SX.mono} fontSize="12px" color={SX.text} textAlign="right">
              {pct(r.share)}
            </Text>
            <Flex align="center" gap={2}>
              <Box flex="1" h="6px" bg={SX.line} borderRadius="full" overflow="hidden">
                <Box h="100%" w={`${Math.min(100, (r.share / maxShare) * 100)}%`} bg={SX.accent} />
              </Box>
              <Text fontFamily={SX.mono} fontSize="11px" color={zColor} minW="46px" textAlign="right">
                {r.z >= 0 ? "+" : ""}
                {r.z.toFixed(1)}σ
              </Text>
            </Flex>
            <Flex align="center" gap={2} justify="flex-end">
              {outlier && (
                <Text fontFamily={SX.mono} fontSize="9px" px="4px" py="1px" borderWidth="1px" borderColor={zColor} color={zColor} borderRadius="3px" textTransform="uppercase">
                  outlier
                </Text>
              )}
              <Box as="button" onClick={() => onRemove(r.name)} color={SX.faint} _hover={{ color: SX.down }} fontFamily={SX.mono} fontSize="13px">
                ✕
              </Box>
            </Flex>
          </Box>
        );
      })}
      <Text fontFamily={SX.mono} fontSize="10px" color={SX.faint} mt={2}>
        The artist field is heavy-tailed (many one-spin artists), so any rotated artist reads as several σ
        above the mean — σ ranks over-representation, it is not a significance test.
      </Text>
    </Box>
  );
}
