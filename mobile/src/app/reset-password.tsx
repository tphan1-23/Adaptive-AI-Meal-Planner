import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ErrorText, Input, Label, Muted } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { c } from "@/lib/theme";

/** Reads `#access_token=...&refresh_token=...` (or `?error_description=...`) from a reset link. */
function linkParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = [url.split("#")[1], url.split("?")[1]?.split("#")[0]].filter(Boolean).join("&");
  for (const pair of raw.split("&")) {
    const [k, v] = pair.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent((v ?? "").replace(/\+/g, " "));
  }
  return out;
}

/**
 * Where the "forgot password" email opens the app. The link carries a short-lived recovery session; we
 * start it, let the user pick a new password, and then continue into the app.
 */
export default function ResetPassword() {
  const insets = useSafeAreaInsets();
  const url = Linking.useURL();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [problemText, setProblemText] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const wait = setTimeout(() => !cancelled && setState((s) => (s === "checking" ? "invalid" : s)), 5000);
    async function start() {
      if (!url) return;
      const p = linkParams(url);
      if (p.error_description || p.error) {
        if (!cancelled) {
          setProblemText(p.error_description ?? p.error);
          setState("invalid");
        }
        return;
      }
      if (!p.access_token || !p.refresh_token) return;
      const { error } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
      if (!cancelled) setState(error ? "invalid" : "ready");
    }
    start();
    return () => {
      cancelled = true;
      clearTimeout(wait);
    };
  }, [url]);

  const mismatch = password.length < 6 ? "The password needs at least 6 characters." : password !== again ? "The passwords don't match." : null;

  async function save() {
    if (mismatch || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setState("done");
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.white }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: "600", letterSpacing: -0.8, marginBottom: 8 }}>
          Choose a new password
        </Text>
        {state === "checking" && <Muted style={{ fontSize: 16 }}>Checking your reset link…</Muted>}
        {state === "invalid" && (
          <>
            <Muted style={{ fontSize: 16, marginBottom: 24 }}>
              {problemText ? `${problemText}. ` : ""}This reset link is missing or has expired. Ask for a new one with &quot;Forgot password?&quot; on the sign-in screen.
            </Muted>
            <Button title="Back to sign in" onPress={() => router.replace("/login")} />
          </>
        )}
        {state === "ready" && (
          <>
            <Muted style={{ fontSize: 16, marginBottom: 24 }}>Pick something you haven&apos;t used before.</Muted>
            <Label>New password</Label>
            <Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" placeholder="At least 6 characters" />
            <View style={{ marginTop: 16 }}>
              <Label>Repeat new password</Label>
              <Input value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" onSubmitEditing={save} />
            </View>
            {password ? <ErrorText>{mismatch}</ErrorText> : null}
            <ErrorText>{error}</ErrorText>
            <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: 32 }}>
              <Button title="Save new password" onPress={save} loading={busy} disabled={Boolean(mismatch)} />
            </View>
          </>
        )}
        {state === "done" && (
          <>
            <Muted style={{ fontSize: 16, marginBottom: 24 }}>Your password was changed.</Muted>
            <Button title="Continue" onPress={() => router.replace("/today")} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
