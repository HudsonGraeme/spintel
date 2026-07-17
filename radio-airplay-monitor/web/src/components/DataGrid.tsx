import { useMemo, useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import type { Spin } from "../lib/data";
import { SX } from "../lib/ui";

type Key = "at" | "s" | "a" | "t" | "src";
type Dir = "asc" | "desc";

interface Col {
  key: Key;
  label: string;
  width: string;
  numeric?: boolean;
  render: (sp: Spin, name: (id: string) => string) => React.ReactNode;
}

const fmtTime = (at: number) =>
  new Date(at * 1000).toLocaleString(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

const COLS: Col[] = [
  { key: "at", label: "Timestamp", width: "168px", numeric: true, render: (sp) => fmtTime(sp.at) },
  { key: "s", label: "Station", width: "150px", render: (sp, name) => name(sp.s) },
  { key: "a", label: "Artist", width: "minmax(160px,1fr)", render: (sp) => sp.a },
  { key: "t", label: "Title", width: "minmax(160px,1fr)", render: (sp) => sp.t },
  { key: "src", label: "Src", width: "88px", render: (sp) => sp.src },
];

const MAX_ROWS = 500;

// A dense, spreadsheet-style grid strongly bound to the filtered spin set: click a
// column header to sort, sticky header, row numbers, cell gridlines, monospaced
// cells. Sorting applies to the full set before the display cap.
export function DataGrid({
  rows,
  stationName,
}: {
  rows: Spin[];
  stationName: (id: string) => string;
}) {
  const [sortKey, setSortKey] = useState<Key>("at");
  const [dir, setDir] = useState<Dir>("desc");

  const sorted = useMemo(() => {
    const s = [...rows];
    s.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let c: number;
      if (typeof av === "number" && typeof bv === "number") c = av - bv;
      else c = String(av).localeCompare(String(bv));
      return dir === "asc" ? c : -c;
    });
    return s;
  }, [rows, sortKey, dir]);

  const view = sorted.slice(0, MAX_ROWS);
  const template = `56px ${COLS.map((c) => c.width).join(" ")}`;

  const onSort = (k: Key) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir(k === "at" ? "desc" : "asc");
    }
  };

  return (
    <Box borderWidth="1px" borderColor={SX.line} borderRadius="4px" overflow="hidden">
      <Box overflowX="auto" maxH="620px" overflowY="auto">
        <Box minW="760px" fontFamily={SX.mono} fontSize="12px">
          {/* header */}
          <Box
            display="grid"
            gridTemplateColumns={template}
            position="sticky"
            top={0}
            zIndex={1}
            bg={SX.panelHi}
            borderBottomWidth="1px"
            borderColor={SX.lineHi}
          >
            <HeadCell label="#" />
            {COLS.map((c) => (
              <HeadCell
                key={c.key}
                label={c.label}
                numeric={c.numeric}
                active={sortKey === c.key}
                dir={dir}
                onClick={() => onSort(c.key)}
              />
            ))}
          </Box>
          {/* body */}
          {view.map((sp, i) => (
            <Box
              key={`${sp.s}-${sp.at}-${i}`}
              display="grid"
              gridTemplateColumns={template}
              _hover={{ bg: SX.panelHi }}
              bg={i % 2 ? "transparent" : "rgba(255,255,255,0.012)"}
            >
              <Cell color={SX.faint} numeric>
                {i + 1}
              </Cell>
              {COLS.map((c) => (
                <Cell
                  key={c.key}
                  numeric={c.numeric}
                  color={c.key === "a" ? SX.text : SX.dim}
                  strong={c.key === "a"}
                  accent={c.key === "src"}
                >
                  {c.render(sp, stationName)}
                </Cell>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
      {sorted.length > MAX_ROWS && (
        <Flex borderTopWidth="1px" borderColor={SX.line} px={3} py={2} bg={SX.panel}>
          <Text fontFamily={SX.mono} fontSize="11px" color={SX.faint}>
            {MAX_ROWS.toLocaleString()} of {sorted.length.toLocaleString()} rows — refine filters to
            narrow
          </Text>
        </Flex>
      )}
    </Box>
  );
}

function HeadCell({
  label,
  numeric,
  active,
  dir,
  onClick,
}: {
  label: string;
  numeric?: boolean;
  active?: boolean;
  dir?: Dir;
  onClick?: () => void;
}) {
  return (
    <Box
      px={3}
      py="7px"
      borderRightWidth="1px"
      borderColor={SX.line}
      cursor={onClick ? "pointer" : "default"}
      onClick={onClick}
      userSelect="none"
      _hover={onClick ? { color: SX.text } : undefined}
      color={active ? SX.text : SX.dim}
      textTransform="uppercase"
      letterSpacing="0.08em"
      fontSize="11px"
      fontWeight={600}
      textAlign={numeric ? "right" : "left"}
      whiteSpace="nowrap"
    >
      {label}
      {active ? (dir === "asc" ? " ▲" : " ▼") : onClick ? " ↕" : ""}
    </Box>
  );
}

function Cell({
  children,
  numeric,
  color,
  strong,
  accent,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  color?: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <Box
      px={3}
      py="6px"
      borderRightWidth="1px"
      borderBottomWidth="1px"
      borderColor={SX.line}
      color={accent ? SX.accent : color}
      fontWeight={strong ? 600 : 400}
      textAlign={numeric ? "right" : "left"}
      whiteSpace="nowrap"
      overflow="hidden"
      textOverflow="ellipsis"
    >
      {children}
    </Box>
  );
}
