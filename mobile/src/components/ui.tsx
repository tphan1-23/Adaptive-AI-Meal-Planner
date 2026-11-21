import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c } from "@/lib/theme";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "outline" | "dark";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === "primary" ? c.brand : variant === "dark" ? c.ink : c.white;
  const fg = variant === "outline" ? c.ink : c.white;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        {
          minHeight: 52,
          borderRadius: 26,
          backgroundColor: bg,
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: c.ink,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>{title}</Text>}
    </Pressable>
  );
}

export const Spinner = () => <ActivityIndicator color={c.brand} />;

export function Label({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 14, fontWeight: "500", color: c.ink, marginBottom: 8 }}>{children}</Text>;
}

export function Input(props: TextInputProps & { style?: StyleProp<TextStyle> }) {
  return (
    <TextInput
      placeholderTextColor="#9A9A96"
      {...props}
      style={[
        {
          height: 52,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 14,
          paddingHorizontal: 16,
          fontSize: 17,
          color: c.ink,
          backgroundColor: c.white,
        },
        props.style,
      ]}
    />
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={{ color: c.brand, fontSize: 13, marginTop: 12 }}>
      {children}
    </Text>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  height = 52,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
}) {
  return (
    <View style={{ flexDirection: "row" }}>
      {options.map((o, i) => {
        const on = o.value === value;
        const last = options.length - 1;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              height,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? c.ink : c.white,
              borderWidth: 1,
              borderColor: on ? c.ink : c.line,
              borderLeftWidth: i === 0 ? 1 : 0,
              borderTopLeftRadius: i === 0 ? 14 : 0,
              borderBottomLeftRadius: i === 0 ? 14 : 0,
              borderTopRightRadius: i === last ? 14 : 0,
              borderBottomRightRadius: i === last ? 14 : 0,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: on ? "600" : "400", color: on ? c.white : c.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Toggle pill. "dark" = black when on (choices); "danger" = red when on (allergies). */
export function Chip({ label, selected, onPress, variant = "dark" }: { label: string; selected?: boolean; onPress?: () => void; variant?: "dark" | "danger" }) {
  const danger = variant === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        height: 44,
        paddingHorizontal: 18,
        borderRadius: 22,
        borderWidth: 1,
        justifyContent: "center",
        borderColor: selected ? (danger ? c.brand : c.ink) : c.line,
        backgroundColor: selected ? (danger ? c.brandSoft : c.ink) : c.white,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: selected ? "600" : "400", color: selected ? (danger ? c.brandDark : c.white) : c.ink }}>{label}</Text>
    </Pressable>
  );
}

/** Scrolling page body with the design's side padding and top inset. */
export function Page({ children, bottom = 24 }: { children: ReactNode; bottom?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.white }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: bottom, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => (
  <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 36, letterSpacing: -1, fontWeight: "600", color: c.ink }}>
    {children}
  </Text>
);
export const H2 = ({ children }: { children: ReactNode }) => (
  <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "600", color: c.ink }}>
    {children}
  </Text>
);
export const Muted = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text style={[{ fontSize: 14, color: c.muted, lineHeight: 21 }, style]}>{children}</Text>
);

/** Bottom sheet over a dimmed screen (swap, log a meal). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,20,20,0.45)" }}>
        <Pressable accessibilityLabel="Dismiss" style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: c.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#D9D9D6", marginBottom: 14 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: "600", letterSpacing: -0.4 }}>
              {title}
            </Text>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.chip, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 16 }}>✕</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
