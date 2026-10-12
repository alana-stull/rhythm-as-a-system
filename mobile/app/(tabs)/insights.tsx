import React, { useState } from "react";
import { Screen, ScreenHeader, SegmentedControl } from "../../src/design";
import { ShellNote } from "../../src/shell/ShellNote";

export default function Insights() {
  const [range, setRange] = useState<"week" | "month">("week");
  return (
    <Screen
      header={
        <ScreenHeader
          title="Insights"
          right={
            <SegmentedControl
              value={range}
              onChange={setRange}
              options={[{ key: "week", label: "Week" }, { key: "month", label: "Month" }]}
            />
          }
        />
      }
    >
      <ShellNote>
        State per day (the state is always the headline), day detail sheet with evidence, confidence and any disagreement,
        patterns, and where the week went by tag.
      </ShellNote>
    </Screen>
  );
}
