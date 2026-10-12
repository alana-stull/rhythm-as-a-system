import type { BottomTabBarProps } from "expo-router/tabs";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconName } from "../icons";
import { color as c, minTouch } from "../tokens";

// Icon-only bar on a hairline: amber when active, muted otherwise. Labels are
// not drawn but are kept for VoiceOver ("Today, tab, 1 of 5, selected").
// Route names must match IconName (today, plan, tasks, insights, you).
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.title === "string" ? options.title : route.name;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={styles.item}
          >
            <Icon name={route.name as IconName} size={24} color={focused ? c.amber : c.muted} strokeWidth={focused ? 2.2 : 2} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: c.cream,
    borderTopWidth: 1,
    borderTopColor: c.hairline,
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: minTouch + 4 },
});
