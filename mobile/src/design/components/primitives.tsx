import React from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { color as c, minTouch, radius, space } from "../tokens";
import { fontFamily, type } from "../typography";
import { Text } from "./Text";

// ── Card ──────────────────────────────────────────────────────────────────────
// Hairline border, no shadow. `list` padding is for cards that hold rows.
export function Card({
  children,
  padding = "md",
  style,
}: {
  children: React.ReactNode;
  padding?: "md" | "list";
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, padding === "list" ? styles.cardList : styles.cardMd, style]}>{children}</View>;
}

// ── Dark callout ("What matters now", "Today, roughly") ──────────────────────
export function DarkCallout({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <View style={styles.dark}>
      <Eyebrow tone="onInk" style={{ marginBottom: 6 }}>{eyebrow}</Eyebrow>
      {children}
    </View>
  );
}

// ── Eyebrow ───────────────────────────────────────────────────────────────────
export function Eyebrow({
  children,
  tone = "muted",
  style,
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "onInk";
  style?: StyleProp<ViewStyle>;
}) {
  const col = tone === "accent" ? c.amberText : tone === "onInk" ? c.onInkMuted : c.muted;
  return (
    <View style={style}>
      <Text variant="eyebrow" color={col} accessibilityRole="header">{children}</Text>
    </View>
  );
}

// ── Section header (serif title + optional link) ─────────────────────────────
export function SectionHeader({
  title,
  linkLabel,
  onLinkPress,
}: {
  title: string;
  linkLabel?: string;
  onLinkPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="section" accessibilityRole="header">{title}</Text>
      {linkLabel && (
        <Pressable onPress={onLinkPress} hitSlop={12} accessibilityRole="link">
          <Text variant="metaStrong" color={c.amberText}>{linkLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  fullWidth = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const isSm = size === "sm";
  const base: ViewStyle[] = [
    styles.button,
    isSm && styles.buttonSm,
    fullWidth && { alignSelf: "stretch" },
    variant === "primary" && { backgroundColor: disabled ? c.disabled : c.ink },
    variant === "secondary" && { borderWidth: 1, borderColor: c.borderStrong },
    variant === "ghost" && styles.buttonGhost,
  ].filter(Boolean) as ViewStyle[];
  const textColor =
    variant === "primary" ? c.onInk : variant === "ghost" ? (disabled ? c.disabled : c.amberText) : disabled ? c.disabled : c.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      hitSlop={variant === "ghost" ? 10 : undefined}
      style={({ pressed }) => [...base, pressed && !disabled && { opacity: 0.75 }, style]}
    >
      <Text variant={isSm ? "metaStrong" : "button"} color={textColor} style={{ textAlign: "center" }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Text field ────────────────────────────────────────────────────────────────
// `inline` is the borderless input used inside list cards ("Add a priority").
export function TextField({ inline = false, style, ...rest }: TextInputProps & { inline?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={c.muted}
      maxFontSizeMultiplier={type.body.maxScale}
      {...rest}
      style={[styles.input, inline ? styles.inputInline : styles.inputBoxed, style]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: c.hairline,
    borderRadius: radius.card,
  },
  cardMd: { paddingVertical: 14, paddingHorizontal: space.md },
  cardList: { paddingVertical: 2, paddingHorizontal: space.xxs },
  dark: {
    backgroundColor: c.ink,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: space.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: space.xs,
  },
  button: {
    minHeight: minTouch + 4,
    borderRadius: radius.button,
    paddingHorizontal: space.gutter,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSm: { minHeight: 36, borderRadius: 9, paddingHorizontal: 14 },
  buttonGhost: { minHeight: 0, paddingHorizontal: 0, alignItems: "flex-start" },
  input: {
    fontFamily: fontFamily.sans,
    fontSize: type.body.style.fontSize,
    color: c.ink,
  },
  inputBoxed: {
    minHeight: minTouch + 4,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.option,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputInline: { flex: 1, minHeight: minTouch, paddingVertical: 0 },
});
