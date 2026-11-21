import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ErrorText, Input, Label, Muted, Segmented } from "@/components/ui";
import { api } from "@/lib/api";
import { configured, supabase } from "@/lib/supabase";
import { c } from "@/lib/theme";

type Mode = "signin" | "signup";
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export default function Login() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmit = isEmail(email) && password.length >= (mode === "signup" ? 6 : 1);

  /** New users go to onboarding, others to Today. */
  async function goOn() {
    let hasProfile = false;
    try {
      hasProfile = Boolean((await api<{ profile: unknown }>("/api/profile")).profile);
    } catch {
      // If the check fails, onboarding is safe to redo.
    }
    router.replace(hasProfile ? "/today" : "/onboarding");
  }

  async function submit() {
    if (!canSubmit || loading) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await goOn();
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) await goOn();
        else {
          setInfo(`Check ${email.trim()} for a confirmation link, then sign in here.`);
          setMode("signin");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Try again.";
      setError(msg === "Invalid login credentials" ? "Wrong email or password." : msg);
    } finally {
      setLoading(false);
    }
  }

  async function forgot() {
    setError(null);
    setInfo(null);
    if (!isEmail(email)) return setError("Type your email above first.");
    // The reset email links to the web app's set-new-password page when its address is configured
    // (EXPO_PUBLIC_WEB_URL, which must also be an allowed redirect URL in Supabase).
    const web = (process.env.EXPO_PUBLIC_WEB_URL ?? "").replace(/\/$/, "");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), web ? { redirectTo: `${web}/reset-password` } : undefined);
    if (error) setError(error.message);
    else setInfo(`If ${email.trim()} has an account, a reset link is on its way.`);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.white }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Text style={{ fontSize: 28 }}>🍽</Text>
        </View>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: "600", letterSpacing: -0.8, marginBottom: 8 }}>
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </Text>
        <Muted style={{ fontSize: 16, marginBottom: 24 }}>
          {mode === "signin" ? "Sign in to see today's plan." : "A plan that fits your calories, your rules and your kitchen."}
        </Muted>

        <Segmented<Mode>
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Sign up" },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
            setInfo(null);
          }}
        />

        <View style={{ marginTop: 24 }}>
          <Label>Email</Label>
          <Input value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoCorrect={false} />
        </View>
        <View style={{ marginTop: 16 }}>
          <Label>Password</Label>
          <View>
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              style={{ paddingRight: 64 }}
              onSubmitEditing={submit}
            />
            <Pressable accessibilityRole="button" onPress={() => setShowPw((v) => !v)} style={{ position: "absolute", right: 16, height: 52, justifyContent: "center" }}>
              <Text style={{ color: c.brand, fontWeight: "600" }}>{showPw ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          {mode === "signin" && (
            <Pressable accessibilityRole="button" onPress={forgot} style={{ alignSelf: "flex-end", paddingVertical: 10 }}>
              <Text style={{ color: c.brand, fontSize: 13, fontWeight: "600" }}>Forgot password?</Text>
            </Pressable>
          )}
        </View>

        {!configured && <ErrorText>Supabase keys are missing. Copy mobile/.env.example to mobile/.env and fill it in, then restart Expo.</ErrorText>}
        <ErrorText>{error}</ErrorText>
        {info ? <Text style={{ color: c.ok, fontSize: 13, marginTop: 12 }}>{info}</Text> : null}

        <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: 32 }}>
          <Button title={mode === "signin" ? "Sign in" : "Create account"} onPress={submit} loading={loading} disabled={!canSubmit || !configured} />
          <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")} style={{ paddingVertical: 16, alignItems: "center" }}>
            <Muted>
              {mode === "signin" ? "New here? " : "Already have an account? "}
              <Text style={{ color: c.brand, fontWeight: "600" }}>{mode === "signin" ? "Create an account" : "Sign in"}</Text>
            </Muted>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
