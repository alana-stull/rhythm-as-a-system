import React, { useState } from "react";
import { BottomSheet, Button, FAB, Screen, ScreenHeader, SegmentedControl, Text, TextField, color, space } from "../../src/design";
import { ShellNote } from "../../src/shell/ShellNote";

type View_ = "day" | "week" | "month";

export default function Plan() {
  const [view, setView] = useState<View_>("day");
  const [sheet, setSheet] = useState(false);
  return (
    <Screen
      header={
        <ScreenHeader
          title="Plan"
          right={
            <SegmentedControl<View_>
              value={view}
              onChange={setView}
              options={[{ key: "day", label: "Day" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }]}
            />
          }
        />
      }
      overlay={<FAB onPress={() => setSheet(true)} accessibilityLabel="Add commitment" />}
    >
      <ShellNote>
        {view === "day" && "Day timeline: synced events (read-only), Rhythm blocks, tasks, protected time and open windows, with overlaps side by side."}
        {view === "week" && "Week strip with the selected day's events below."}
        {view === "month" && "Month grid with a capacity-state dot per day and a day summary."}
      </ShellNote>
      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Add commitment">
        <TextField placeholder="What is it?" accessibilityLabel="Commitment title" />
        <Text variant="meta" color={color.muted} style={{ marginTop: space.sm }}>Time picker and save arrive with Plan.</Text>
        <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheet(false)} style={{ marginTop: space.md }} />
      </BottomSheet>
    </Screen>
  );
}
