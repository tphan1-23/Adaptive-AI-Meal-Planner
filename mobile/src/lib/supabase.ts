import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const configured = Boolean(url && anon);

// Public URL + anon key only. The service-role key and Gemini key never go in the app.
export const supabase = createClient(url || "http://invalid.local", anon || "missing", {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Refresh tokens only while the app is in the foreground (Supabase's recommendation for React Native).
AppState.addEventListener("change", (s) => {
  if (s === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
