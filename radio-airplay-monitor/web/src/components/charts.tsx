import { Box, Text } from "@chakra-ui/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Slice, StackRow } from "../lib/agg";
import type { Viz } from "../lib/viz";

// ---- shared themed tooltip -------------------------------------------------

interface TipRow {
  name?: unknown;
  value?: unknown;
  payload?: Record<string, unknown>;
}
interface TipProps {
  active?: boolean;
  payload?: readonly TipRow[];
  label?: unknown;
}

function TipShell({ viz, children }: { viz: Viz; children: React.ReactNode }) {
  return (
    <Box
      bg={viz.tooltipBg}
      border="1px solid"
      borderColor={viz.tooltipBorder}
      borderRadius="md"
      px={3}
      py={2}
      fontSize="sm"
      boxShadow="md"
      color={viz.ink}
    >
      {children}
    </Box>
  );
}

const nf = new Intl.NumberFormat();

// ---- airplay over time: stacked bars by station ----------------------------

export function TimelineBars({
  rows,
  stations,
  viz,
}: {
  rows: StackRow[];
  stations: { id: string; name: string }[];
  viz: Viz;
}) {
  const nameOf = new Map(stations.map((s) => [s.id, s.name]));
  const color = (i: number) => viz.categorical[i % viz.categorical.length];

  const tip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload || !payload.length) return null;
    const partial = Boolean((payload[0].payload as Record<string, unknown>)?.partial);
    const total = Number((payload[0].payload as Record<string, unknown>)?.total) || 0;
    const parts = [...payload]
      .filter((p) => Number(p.value) > 0)
      .sort((a, b) => Number(b.value) - Number(a.value));
    return (
      <TipShell viz={viz}>
        <Text fontWeight="semibold">
          {String(label ?? "")}
          {partial ? " · partial" : ""}
        </Text>
        <Text mb={1} color={viz.muted}>
          {nf.format(total)} spins
        </Text>
        {parts.map((p) => (
          <Text key={String(p.name)} fontSize="xs">
            <Box as="span" display="inline-block" w="8px" h="8px" mr={1} borderRadius="sm" bg={String(((p as { color?: string }).color) || viz.muted)} />
            {nameOf.get(String(p.name)) ?? String(p.name)}: {nf.format(Number(p.value) || 0)}
          </Text>
        ))}
      </TipShell>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="8%">
        <CartesianGrid stroke={viz.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: viz.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: viz.axis }}
          minTickGap={28}
        />
        <YAxis width={34} allowDecimals={false} tick={{ fill: viz.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={tip} cursor={{ fill: viz.grid, fillOpacity: 0.35 }} />
        <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, color: viz.ink }} formatter={(v) => nameOf.get(String(v)) ?? String(v)} />
        {stations.map((s, i) => (
          <Bar key={s.id} dataKey={s.id} stackId="a" fill={color(i)} isAnimationActive={false} maxBarSize={40}>
            {rows.map((r) => (
              <Cell key={r.t} fillOpacity={r.partial ? 0.35 : 1} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- top artists (horizontal bars) -----------------------------------------

export function TopArtistsBar({
  data,
  viz,
  selected,
  onToggle,
}: {
  data: { artist: string; spins: number }[];
  viz: Viz;
  selected?: Set<string>;
  onToggle?: (artist: string) => void;
}) {
  const height = Math.max(180, data.length * 30 + 20);
  const hasSel = selected && selected.size > 0;
  const tip = ({ active, payload }: TipProps) =>
    active && payload && payload.length ? (
      <TipShell viz={viz}>
        <Text fontWeight="semibold">{String(payload[0].payload?.artist ?? "")}</Text>
        <Text>{nf.format(Number(payload[0].value) || 0)} spins</Text>
        {onToggle && <Text color={viz.muted} fontSize="xs">click to compare</Text>}
      </TipShell>
    ) : null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={viz.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: viz.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: viz.axis }} />
        <YAxis type="category" dataKey="artist" width={130} tick={{ fill: viz.ink, fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip content={tip} cursor={{ fill: viz.grid, fillOpacity: 0.4 }} />
        <Bar
          dataKey="spins"
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          isAnimationActive={false}
          cursor={onToggle ? "pointer" : "default"}
          onClick={
            onToggle
              ? (((e: { artist?: string; payload?: { artist?: string } }) => {
                  const a = e?.artist ?? e?.payload?.artist;
                  if (a) onToggle(a);
                }) as React.ComponentProps<typeof Bar>["onClick"])
              : undefined
          }
        >
          {data.map((d) => {
            const on = selected?.has(d.artist);
            return <Cell key={d.artist} fill={viz.series} fillOpacity={!hasSel || on ? 1 : 0.32} />;
          })}
          <LabelList dataKey="spins" position="right" fill={viz.muted} fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- share pie (spins by station / artist / song) --------------------------

export function SharePie({
  data,
  viz,
  onSlice,
  height = 260,
}: {
  data: Slice[];
  viz: Viz;
  onSlice?: (name: string) => void;
  height?: number;
}) {
  const color = (name: string, i: number) =>
    name === "Other" ? viz.other : viz.categorical[i % viz.categorical.length];

  const tip = ({ active, payload }: TipProps) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload as unknown as Slice;
    return (
      <TipShell viz={viz}>
        <Text fontWeight="semibold">{p.name}</Text>
        <Text>
          {nf.format(p.value)} spins · {p.pct.toFixed(1)}%
        </Text>
      </TipShell>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="45%"
          outerRadius="78%"
          paddingAngle={1.5}
          isAnimationActive={false}
          stroke={viz.surface}
          strokeWidth={2}
          onClick={onSlice ? (d: { name?: string }) => d?.name && onSlice(d.name) : undefined}
          cursor={onSlice ? "pointer" : "default"}
          label={(p: { name?: string; percent?: number }) =>
            (p.percent ?? 0) >= 0.07 ? `${((p.percent ?? 0) * 100).toFixed(0)}%` : ""
          }
          labelLine={false}
          fontSize={11}
        >
          {data.map((s, i) => (
            <Cell key={s.name} fill={color(s.name, i)} />
          ))}
        </Pie>
        <Tooltip content={tip} />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          iconSize={9}
          wrapperStyle={{ fontSize: 12, color: viz.ink }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
