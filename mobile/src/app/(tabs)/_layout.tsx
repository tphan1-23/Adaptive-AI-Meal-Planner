import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
        tabBarStyle: { borderTopColor: c.line, backgroundColor: c.white },
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
    </Tabs>
  );
}
