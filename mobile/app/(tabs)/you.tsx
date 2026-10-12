import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { Button, Card, Screen, ScreenHeader, SectionHeader, TagChip, Text, color, space } from "../../src/design";
import { tags } from "../../src/fixtures/p0";
import { ShellNote } from "../../src/shell/ShellNote";

export default function You() {
  const router = useRouter();
  return (
    <Screen
      header={
        <ScreenHeader
          title="You"
          right={<Button size="sm" variant="secondary" label="Settings" onPress={() => router.push("/settings")} />}
        />
      }
    >
      <ShellNote>Goals, everyday rhythms and "what helps me feel my best" come next.</ShellNote>
      <View>
        <SectionHeader title="The parts of my life" />
        <Card>
          <Text variant="meta" color={color.muted} style={{ marginBottom: space.xs }}>
            Shows up as color on Today, Plan, and Tasks.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.values(tags).map((t) => <TagChip key={t.id} tag={t} />)}
          </View>
        </Card>
      </View>
      <View style={{ gap: space.xs, marginTop: space.sm }}>
        <Text variant="eyebrow" color={color.muted}>Design review (P0)</Text>
        <Button variant="secondary" label="Component gallery" onPress={() => router.push("/design")} />
      </View>
    </Screen>
  );
}
