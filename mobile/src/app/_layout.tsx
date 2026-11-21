import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Spinner } from "@/components/ui";
import { SessionProvider, useSession } from "@/lib/session";

function Gate() {
  const { session, loading } = useSession();
  const first = useSegments()[0];

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <Spinner />
      </View>
    );
  }
  // Logged out: only the login screen is reachable. Logged in: skip the login screen.
  if (!session && first !== "login") return <Redirect href="/login" />;
  if (session && first === "login") return <Redirect href="/today" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#fff" } }}>
      <Stack.Screen name="recipes/[id]" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
