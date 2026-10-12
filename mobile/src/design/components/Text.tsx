import React from "react";
import { Text as RNText, TextProps } from "react-native";
import { color as c } from "../tokens";
import { type, TypeRole } from "../typography";

type Props = TextProps & { variant?: TypeRole; color?: string };

// All app text goes through this so every role keeps its family, size and
// Dynamic Type cap. Nested <Text> inherits the parent's style (for highlights).
export function Text({ variant = "body", color, style, ...rest }: Props) {
  const role = type[variant];
  return (
    <RNText
      maxFontSizeMultiplier={role.maxScale}
      {...rest}
      style={[role.style, { color: color ?? c.ink }, style]}
    />
  );
}
