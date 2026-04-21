import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius, space } from "../theme";

interface StateBadgeProps {
  condition: string;
  size?: "sm" | "md";
}

const FALLBACK = { bg: "#F0F0EE", text: "#6B6B6B", dot: "#ABABAB" };

export function StateBadge({ condition, size = "md" }: StateBadgeProps) {
  const c = colors.condition[condition] ?? FALLBACK;
  const isSmall = size === "sm";

  return (
    <View style={[styles.pill, { backgroundColor: c.bg }, isSmall && styles.pillSm]}>
      <View style={[styles.dot, { backgroundColor: c.dot }, isSmall && styles.dotSm]} />
      <Text style={[styles.label, { color: c.text }, isSmall && styles.labelSm]}>
        {condition}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: space[8],
    borderRadius: radius.full,
    gap: space[3],
  },

  pillSm: {
    paddingVertical: 3,
    paddingHorizontal: space[5],
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },

  dotSm: {
    width: 6,
    height: 6,
  },

  label: {
    fontSize: font.size.lg,
    fontWeight: font.weight.medium,
    letterSpacing: -0.2,
  },

  labelSm: {
    fontSize: font.size.sm,
  },
});
