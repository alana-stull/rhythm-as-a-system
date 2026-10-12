import React from "react";
import Svg, { Circle, Path, Polyline, Rect } from "react-native-svg";
import { color as c } from "./tokens";

// Stroke icons copied from the iOS boards (24x24 viewBox, round caps).
export type IconName =
  | "today" | "plan" | "tasks" | "insights" | "you"
  | "plus" | "close" | "check" | "star"
  | "chevronDown" | "chevronLeft" | "chevronRight";

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number; filled?: boolean };

export function Icon({ name, size = 20, color = c.muted, strokeWidth = 2, filled = false }: Props) {
  const common = {
    fill: "none" as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === "today" && (
        <>
          <Circle cx={12} cy={12} r={4} {...common} />
          <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...common} />
        </>
      )}
      {name === "plan" && (
        <>
          <Rect x={3} y={4} width={18} height={18} rx={3} {...common} />
          <Path d="M3 10h18M8 2v4M16 2v4" {...common} />
        </>
      )}
      {name === "tasks" && <Path d="m3 6 2 2 4-4M11 6h10M3 15l2 2 4-4M11 15h10" {...common} />}
      {name === "insights" && <Path d="M5 21V16M10 21V11M15 21V6M20 21V3" {...common} />}
      {name === "you" && (
        <>
          <Circle cx={12} cy={8} r={4} {...common} />
          <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" {...common} />
        </>
      )}
      {name === "plus" && <Path d="M12 5v14M5 12h14" {...common} />}
      {name === "close" && <Path d="M18 6 6 18M6 6l12 12" {...common} />}
      {name === "check" && <Polyline points="20 6 9 17 4 12" {...common} />}
      {name === "chevronDown" && <Polyline points="6 9 12 15 18 9" {...common} />}
      {name === "chevronLeft" && <Path d="M15 18l-6-6 6-6" {...common} />}
      {name === "chevronRight" && <Path d="M9 18l6-6-6-6" {...common} />}
      {name === "star" && (
        <Path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          {...common}
          fill={filled ? color : "none"}
        />
      )}
    </Svg>
  );
}
