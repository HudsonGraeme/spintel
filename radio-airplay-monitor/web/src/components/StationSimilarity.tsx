import { useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import type { SimMatrix } from "../lib/agg";
import { SX } from "../lib/ui";

// dark → accent-blue ramp for the cell magnitude (single hue, gamma-spread so the
// mid-range separates on the dark surface).
function ramp(t: number): string {
  const g = Math.pow(Math.max(0, Math.min(1, t)), 0.8);
  const c0 = [16, 20, 27]; // near-panel
  const c1 = [75, 156, 255]; // SX.accent
  const ch = (i: number) => Math.round(c0[i] + (c1[i] - c0[i]) * g);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

export function StationSimilarity({ sim }: { sim: SimMatrix }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const n = sim.names.length;
  if (n < 2) return <Empty />;

  const twins =
    sim.topPair && `${sim.names[sim.topPair.a]} ↔ ${sim.names[sim.topPair.b]} (${sim.topPair.v.toFixed(2)})`;
  const distinct = sim.outlier && `${sim.names[sim.outlier.i]} (avg ${sim.outlier.avg.toFixed(2)})`;

  const template = `84px repeat(${n}, minmax(0, 1fr))`;

  return (
    <Box>
      <Box overflowX="auto">
        <Box minW={`${84 + n * 52}px`}>
          {/* header */}
          <Box display="grid" gridTemplateColumns={template} gap="2px" mb="2px">
            <Box />
            {sim.short.map((s, j) => (
              <Text key={j} fontFamily={SX.mono} fontSize="11px" color={hover?.j === j ? SX.text : SX.dim} textAlign="center">
                {s}
              </Text>
            ))}
          </Box>
          {sim.m.map((row, i) => (
            <Box key={i} display="grid" gridTemplateColumns={template} gap="2px" mb="2px">
              <Flex align="center" justify="flex-end" pr={2}>
                <Text fontFamily={SX.mono} fontSize="11px" color={hover?.i === i ? SX.text : SX.dim} noOfLines={1}>
                  {sim.short[i]}
                </Text>
              </Flex>
              {row.map((v, j) => {
                const self = i === j;
                const bg = self ? SX.panelHi : ramp(v);
                const hot = v > 0.5;
                return (
                  <Flex
                    key={j}
                    h="40px"
                    align="center"
                    justify="center"
                    bg={bg}
                    borderRadius="3px"
                    borderWidth={hover && hover.i === i && hover.j === j ? "1px" : "0"}
                    borderColor={SX.text}
                    onMouseEnter={() => setHover({ i, j })}
                    onMouseLeave={() => setHover(null)}
                    cursor="default"
                  >
                    <Text fontFamily={SX.mono} fontSize="11px" color={self ? SX.faint : hot ? SX.page : SX.dim}>
                      {self ? "—" : v.toFixed(2)}
                    </Text>
                  </Flex>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>

      <Flex mt={3} gap={{ base: 4, md: 8 }} flexWrap="wrap">
        {twins && <Takeaway label="Playlist twins" value={twins} color={SX.accent} />}
        {distinct && <Takeaway label="Most distinct" value={distinct} color={SX.warn} />}
      </Flex>
      {hover && !isSelf(hover) && (
        <Text mt={2} fontFamily={SX.mono} fontSize="11px" color={SX.dim}>
          {sim.names[hover.i]} × {sim.names[hover.j]} share {(sim.m[hover.i][hover.j] * 100).toFixed(0)}% of their
          rotation
        </Text>
      )}
    </Box>
  );
}

function isSelf(h: { i: number; j: number }) {
  return h.i === h.j;
}

function Takeaway({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box minW={0}>
      <Text textTransform="uppercase" letterSpacing="0.1em" fontSize="10px" color={SX.faint}>
        {label}
      </Text>
      <Text fontFamily={SX.mono} fontSize="13px" color={color} noOfLines={1}>
        {value}
      </Text>
    </Box>
  );
}

function Empty() {
  return (
    <Flex h="120px" align="center" justify="center" color={SX.faint} fontFamily={SX.mono} fontSize="sm">
      NEED ≥2 ACTIVE STATIONS
    </Flex>
  );
}
