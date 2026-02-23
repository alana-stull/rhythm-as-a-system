import React from "react";
import { ScoreRing } from "./ScoreRing";
import { colors } from "../../tokens/design";
import type { ScoreData } from "../../api/client";

interface ScoreGridProps {
  scores: ScoreData | null;
  skeleton?: boolean;
}

export function ScoreGrid({ scores, skeleton }: ScoreGridProps) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 24,
      justifyItems: "center",
      padding: "32px 0",
    }}>
      <ScoreRing
        value={skeleton ? null : (scores?.recovery_score ?? null)}
        color={colors.ring.recovery}
        label="Recovery"
      />
      <ScoreRing
        value={skeleton ? null : (scores?.exposure_score ?? null)}
        color={colors.ring.exposure}
        label="Exposure"
      />
      <ScoreRing
        value={skeleton ? null : (scores?.friction_score ?? null)}
        color={colors.ring.friction}
        label="Friction"
      />
    </div>
  );
}
