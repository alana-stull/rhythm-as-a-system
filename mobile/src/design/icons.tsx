import React from "react";
import Svg, { Circle, Path, Polyline, Rect } from "react-native-svg";
import { color as c } from "./tokens";

// Stroke icons copied from the iOS boards (24x24 viewBox, round caps).
export type IconName =
  | "today" | "plan" | "tasks" | "insights" | "you"
  | "plus" | "close" | "check" | "star"
  | "chevronDown" | "chevronLeft" | "chevronRight"
  | "settings" | "heart" | "sunrise" | "info";

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
      {name === "settings" && (
        <>
          <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" {...common} />
          <Circle cx={12} cy={12} r={3} {...common} />
        </>
      )}
      {name === "heart" && (
        <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" {...common} />
      )}
      {name === "sunrise" && (
        <Path d="M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0" {...common} />
      )}
      {name === "info" && (
        <>
          <Circle cx={12} cy={12} r={10} {...common} />
          <Path d="M12 16v-4M12 8h.01" {...common} />
        </>
      )}
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
