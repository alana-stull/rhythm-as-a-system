import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BreakScreen } from "./src/screens/BreakScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { InsightsScreen } from "./src/screens/InsightsScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { colors, font, space } from "./src/theme";

type Tab = "today" | "history" | "break" | "insights";

// ── Icons ──────────────────────────────────────────────────────────────────────
function TodayIcon({ active }: { active: boolean }) {
  const c = active ? colors.text.primary : colors.text.muted;
  const bw = active ? 1.8 : 1.4;
  return (
    <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      <View style={{
        width: 20, height: 20, borderRadius: 10,
        borderWidth: bw, borderColor: c,
        alignItems: "center", justifyContent: "center",
      }}>
        <View style={{ width: active ? 5 : 4, height: active ? 5 : 4, borderRadius: 3, backgroundColor: c }} />
      </View>
    </View>
  );
}

function HistoryIcon({ active }: { active: boolean }) {
  const c = active ? colors.text.primary : colors.text.muted;
  const bw = active ? 1.8 : 1.4;
  return (
    <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      <View style={{
        width: 20, height: 20, borderRadius: 10,
        borderWidth: bw, borderColor: c,
        alignItems: "center", justifyContent: "center",
      }}>
        {/* minute hand */}
        <View style={{
          position: "absolute", width: 1.5, height: 6,
          backgroundColor: c, borderRadius: 1,
          bottom: "50%", left: "50%", marginLeft: -0.75,
          transform: [{ rotate: "10deg" }, { translateY: 1 }],
        }} />
        {/* hour hand */}
        <View style={{
          position: "absolute", width: 5, height: 1.5,
          backgroundColor: c, borderRadius: 1,
          top: "50%", left: "50%", marginTop: -0.75,
        }} />
      </View>
    </View>
  );
}

function BreakIcon({ active }: { active: boolean }) {
  const c = active ? colors.text.primary : colors.text.muted;
  const bw = active ? 1.8 : 1.4;
  return (
    <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      {/* Cup body */}
      <View style={{ width: 13, height: 10, borderWidth: bw, borderColor: c, borderRadius: 2, marginTop: 2 }} />
      {/* Handle */}
      <View style={{
        position: "absolute", right: 2, top: 6,
        width: 4, height: 6,
        borderTopWidth: bw, borderRightWidth: bw, borderBottomWidth: bw,
        borderColor: c, borderTopRightRadius: 3, borderBottomRightRadius: 3,
      }} />
      {/* Saucer */}
      <View style={{ width: 17, height: bw, backgroundColor: c, borderRadius: 1, marginTop: 2 }} />
    </View>
  );
}

function InsightsIcon({ active }: { active: boolean }) {
  const c = active ? colors.text.primary : colors.text.muted;
  const bw = active ? 1.8 : 1.4;
  return (
    <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      {/* Segment 1: up-right */}
      <View style={{
        position: "absolute", width: 8, height: bw,
        backgroundColor: c, borderRadius: 1,
        left: 1, top: 13,
        transform: [{ rotate: "-35deg" }],
      }} />
      {/* Segment 2: down-right */}
      <View style={{
        position: "absolute", width: 8, height: bw,
        backgroundColor: c, borderRadius: 1,
        left: 7, top: 9,
        transform: [{ rotate: "35deg" }],
      }} />
      {/* Segment 3: up-right tail */}
      <View style={{
        position: "absolute", width: 7, height: bw,
        backgroundColor: c, borderRadius: 1,
        left: 13, top: 12,
        transform: [{ rotate: "-20deg" }],
      }} />
    </View>
  );
}

const TAB_ICONS = {
  today:    TodayIcon,
  history:  HistoryIcon,
  break:    BreakIcon,
  insights: InsightsIcon,
};

const TABS: { key: Tab; label: string }[] = [
  { key: "today",    label: "Today" },
  { key: "history",  label: "History" },
  { key: "break",    label: "Break" },
  { key: "insights", label: "Insights" },
];

// ── Inner layout (needs insets hook) ──────────────────────────────────────────
function AppLayout() {
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        {activeTab === "today"    && <TodayScreen />}
        {activeTab === "history"  && <HistoryScreen />}
        {activeTab === "break"    && <BreakScreen />}
        {activeTab === "insights" && <InsightsScreen />}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, space[4]) }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const Icon = TAB_ICONS[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.tabItem}
              activeOpacity={0.65}
            >
              <Icon active={active} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ── Root (provides SafeArea context) ─────────────────────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <AppLayout />
    </SafeAreaProvider>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  screen: {
    flex: 1,
  },

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.bg.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 12,
    paddingTop: space[4],
    overflow: Platform.OS === "android" ? "hidden" : "visible",
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: space[2],
  },

  tabLabel: {
    fontSize: 10,
    fontWeight: font.weight.medium,
    color: colors.text.muted,
    letterSpacing: 0.2,
  },

  tabLabelActive: {
    color: colors.text.primary,
    fontWeight: font.weight.semibold,
  },
});
