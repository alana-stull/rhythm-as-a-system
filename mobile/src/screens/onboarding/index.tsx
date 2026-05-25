import React, { useMemo, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SplashScreen from "./SplashScreen";
import WelcomeScreen from "./WelcomeScreen";
import PhoneScreen from "./PhoneScreen";
import NameScreen from "./NameScreen";
import TrackerScreen from "./TrackerScreen";
import ToneScreen from "./ToneScreen";
import DoneScreen from "./DoneScreen";

export default function OnboardingNavigator() {
  const [screenIndex, setScreenIndex] = useState(1);

  const totalSteps = 5;
  const currentStep = useMemo(() => {
    if (screenIndex < 3) return 0;
    return Math.min(totalSteps, screenIndex - 2);
  }, [screenIndex]);

  const next = () => setScreenIndex((s) => Math.min(7, s + 1));
  const back = () => setScreenIndex((s) => Math.max(1, s - 1));

  return (
    <SafeAreaProvider>
      {screenIndex === 1 && <SplashScreen next={next} />}
      {screenIndex === 2 && <WelcomeScreen next={next} />}
      {screenIndex === 3 && <PhoneScreen next={next} back={back} currentStep={currentStep} totalSteps={totalSteps} />}
      {screenIndex === 4 && <NameScreen next={next} back={back} currentStep={currentStep} totalSteps={totalSteps} />}
      {screenIndex === 5 && <TrackerScreen next={next} back={back} currentStep={currentStep} totalSteps={totalSteps} />}
      {screenIndex === 6 && <ToneScreen next={next} back={back} currentStep={currentStep} totalSteps={totalSteps} />}
      {screenIndex === 7 && <DoneScreen />}
    </SafeAreaProvider>
  );
}
