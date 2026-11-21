import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { c } from "@/lib/theme";

const icon = (children: () => React.ReactNode) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={String(color)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {children()}
      </Svg>
    );
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: "500" },
        // Enough room for a 24px icon plus a 14px label, so the label is never squeezed or clipped, plus the phone's bottom inset (home bar).
        tabBarStyle: { borderTopColor: c.line, backgroundColor: c.white, height: 66 + insets.bottom, paddingTop: 6, paddingBottom: 6 + insets.bottom },
        tabBarItemStyle: { paddingVertical: 0 },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          tabBarIcon: icon(() => (
            <>
              <Circle cx="12" cy="12" r="9" />
              <Circle cx="12" cy="12" r="3.5" />
            </>
          )),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: "Shopping",
          tabBarIcon: icon(() => (
            <>
              <Path d="M5 7h14l-1.5 12h-11L5 7Z" />
              <Path d="M9 7a3 3 0 0 1 6 0" />
            </>
          )),
        }}
      />
      <Tabs.Screen name="progress" options={{ title: "Progress", tabBarIcon: icon(() => <Path d="M4 18 9 12l4 3 7-9" />) }} />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Recipes",
          tabBarIcon: icon(() => (
            <>
              <Circle cx="11" cy="11" r="6.500" />
              <Path d="m20 20-4.200-4.200" />
            </>
          )),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Settings",
          tabBarIcon: icon(() => (
            <>
              <Circle cx="12" cy="8" r="3.5" />
              <Path d="M5 20c0-3.5 3.100-6 7-6s7 2.500 7 6" />
            </>
          )),
        }}
      />
    </Tabs>
  );
}
