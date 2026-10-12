import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color as c, elevation, radius, space } from "../tokens";
import { Text } from "./Text";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  kicker?: string; // small label above the title ("Synced event")
  children: React.ReactNode;
};

// Cream sheet with a handle, rising over a scrim. Tapping the scrim closes it.
// Respects Reduce Motion by skipping the slide.
export function BottomSheet({ visible, onClose, title, kicker, children }: Props) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) y.setValue(0);
      else {
        y.setValue(400);
        Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, y]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <Animated.View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg), transform: [{ translateY: y }] }]}
        >
          <View style={styles.handle} />
          {kicker && <Text variant="eyebrow" color={c.muted} style={{ marginBottom: 4 }}>{kicker}</Text>}
          {title && <Text variant="question" accessibilityRole="header" style={{ marginBottom: space.sm }}>{title}</Text>}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: c.scrim },
  sheet: {
    backgroundColor: c.cream,
    borderTopLeftRadius: radius.sheet - 2,
    borderTopRightRadius: radius.sheet - 2,
    paddingTop: 10,
    paddingHorizontal: space.gutter,
    ...elevation.sheet,
  },
  handle: { width: 36, height: 4, borderRadius: 3, backgroundColor: c.sheetHandle, alignSelf: "center", marginBottom: space.md },
});
