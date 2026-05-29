import React, { useEffect, useRef } from "react";
import { Animated, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fontFamily } from "../../theme";

export default function SplashScreen({ next }: { next: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    const t = setTimeout(() => next(), 2800);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#B8772A", alignItems: "center", justifyContent: "center" }}>
      <Animated.Text style={{ fontFamily: fontFamily.heading, fontSize: 120, color: "#F2F0EB", opacity }}>
        r
      </Animated.Text>
    </SafeAreaView>
  );
}
