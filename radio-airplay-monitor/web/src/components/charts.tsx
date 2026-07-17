import { Box, Text } from "@chakra-ui/react";
import {
  Area,
  AreaChart,
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
import type { Slice } from "../lib/agg";
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

// ---- airplay over time -----------------------------------------------------

export interface TimePoint {
  label: string;
  count: number;
}

export function TimelineArea({
  data,
  viz,
  unit,
}: {
  data: TimePoint[];
  viz: Viz;
  unit: string;
}) {
  const tip = ({ active, payload, label }: TipProps) =>
    active && payload && payload.length ? (
      <TipShell viz={viz}>
        <Text fontWeight="semibold">{String(label ?? "")}</Text>
        <Text>{nf.format(Number(payload[0].value) || 0)} spins</Text>
      </TipShell>
    ) : null;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="fillSpins" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={viz.series} stopOpacity={0.28} />
            <stop offset="100%" stopColor={viz.series} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={viz.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: viz.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: viz.axis }}
          minTickGap={24}
        />
        <YAxis
          width={34}
          allowDecimals={false}
          tick={{ fill: viz.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={tip} cursor={{ stroke: viz.axis }} />
        <Area
          type="monotone"
          dataKey="count"
          name={`spins / ${unit}`}
          stroke={viz.series}
          strokeWidth={2}
          fill="url(#fillSpins)"
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---- top artists (horizontal bars) -----------------------------------------

export function TopArtistsBar({
  data,
  viz,
}: {
  data: { artist: string; spins: number }[];
  viz: Viz;
}) {
  const height = Math.max(180, data.length * 30 + 20);
  const tip = ({ active, payload }: TipProps) =>
    active && payload && payload.length ? (
      <TipShell viz={viz}>
        <Text fontWeight="semibold">{String(payload[0].payload?.artist ?? "")}</Text>
        <Text>{nf.format(Number(payload[0].value) || 0)} spins</Text>
      </TipShell>
    ) : null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={viz.grid} horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: viz.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: viz.axis }}
        />
        <YAxis
          type="category"
          dataKey="artist"
          width={130}
          tick={{ fill: viz.ink, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={tip} cursor={{ fill: viz.grid, fillOpacity: 0.4 }} />
        <Bar dataKey="spins" fill={viz.series} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
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
