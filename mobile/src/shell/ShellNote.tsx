import React from "react";
import { Card, color, Eyebrow, Text } from "../design";

// Marks P0 placeholder screens; removed as each screen is implemented.
export function ShellNote({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <Eyebrow tone="accent" style={{ marginBottom: 4 }}>P0 shell</Eyebrow>
      <Text variant="meta" color={color.muted}>{children}</Text>
    </Card>
  );
}
