import { useColorModeValue } from "@chakra-ui/react";

// Colors from the validated data-viz reference palette. The categorical order is
// fixed (assigned by slot, never cycled); pies cap at a few slices + a neutral
// "Other", and every slice is also labelled + legended so identity never rests on
// color alone. Chrome/ink use the palette's neutral roles.
const CATEGORICAL_LIGHT = [
  "#2a78d6", // blue
  "#008300", // green
  "#e87ba4", // magenta
  "#eda100", // yellow
  "#1baf7a", // aqua
  "#eb6834", // orange
  "#4a3aa7", // violet
  "#e34948", // red
];
const CATEGORICAL_DARK = [
  "#3987e5",
  "#008300",
  "#d55181",
  "#c98500",
  "#199e70",
  "#d95926",
  "#9085e9",
  "#e66767",
];

export interface Viz {
  series: string;
  categorical: string[];
  other: string;
  grid: string;
  axis: string;
  muted: string;
  ink: string;
  surface: string;
  tooltipBg: string;
  tooltipBorder: string;
}

export function useViz(): Viz {
  return {
    series: useColorModeValue("#2a78d6", "#3987e5"),
    categorical: useColorModeValue(CATEGORICAL_LIGHT, CATEGORICAL_DARK),
    other: useColorModeValue("#c9c8be", "#54534d"),
    grid: useColorModeValue("#e1e0d9", "#2c2c2a"),
    axis: useColorModeValue("#c3c2b7", "#383835"),
    muted: "#898781",
    ink: useColorModeValue("#0b0b0b", "#ffffff"),
    surface: useColorModeValue("#ffffff", "#1a1a19"),
    tooltipBg: useColorModeValue("#ffffff", "#242423"),
    tooltipBorder: useColorModeValue("#e1e0d9", "#3a3a38"),
  };
}
