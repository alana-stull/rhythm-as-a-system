import React, { useState } from "react";
import { View } from "react-native";
import { Card, ChecklistRow, FAB, Screen, ScreenHeader, Text, color } from "../../src/design";
import { tags } from "../../src/fixtures/p0";
import { ShellNote } from "../../src/shell/ShellNote";

export default function Tasks() {
  const [done, setDone] = useState(false);
  const [starred, setStarred] = useState(true);
  return (
    <Screen header={<ScreenHeader title="Tasks" />} overlay={<FAB onPress={() => {}} accessibilityLabel="Add task" />}>
      <ShellNote>Today / This week / Later groups, tag filter chips and the add-task sheet come next.</ShellNote>
      <View>
        <Text variant="eyebrow" color={color.muted} style={{ marginBottom: 6 }}>Today</Text>
        <Card padding="list">
          <ChecklistRow
            label="Reading response"
            checked={done}
            onToggle={() => setDone((v) => !v)}
            tag={tags.school}
            starred={starred}
            onStar={() => setStarred((v) => !v)}
          />
        </Card>
      </View>
    </Screen>
  );
}
