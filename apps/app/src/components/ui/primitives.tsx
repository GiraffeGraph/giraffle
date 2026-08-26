import { Ionicons } from "@expo/vector-icons";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { controls, radii, spacing, typography, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";
import { useTheme } from "@/design/ThemeProvider";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({
  name,
  size = 19,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.secondary} />;
}

export function Button({
  label,
  icon,
  onPress,
  tone = "quiet",
  disabled = false,
  accessibilityLabel,
}: {
  label?: string;
  icon?: IconName;
  onPress: () => void;
  tone?: "quiet" | "accent" | "danger";
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const touchSized = Platform.OS !== "web" || width < WIDE_LAYOUT_MIN_WIDTH;
  const foreground =
    tone === "accent" ? colors.accentInk : tone === "danger" ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        touchSized ? styles.touchButton : null,
        {
          backgroundColor:
            tone === "accent"
              ? colors.accent
              : pressed
                ? colors.pressed
                : hovered
                  ? colors.hover
                  : "transparent",
          borderColor: focused ? colors.accent : "transparent",
          opacity: disabled ? 0.42 : pressed ? 0.82 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={foreground} /> : null}
      {label ? <Text style={[styles.buttonText, { color: foreground }]}>{label}</Text> : null}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  revealable = false,
  secureTextEntry,
  style,
  ...inputProps
}: TextInputProps & { label: string; error?: string; revealable?: boolean }) {
  const { colors } = useTheme();
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: colors.secondary }]}>{label}</Text>
      <View
        style={[
          styles.inputShell,
          {
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <TextInput
          {...inputProps}
          secureTextEntry={secureTextEntry && !revealed}
          placeholderTextColor={colors.faint}
          style={[styles.input, { color: colors.text }, style]}
        />
        {revealable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            onPress={() => setRevealed((value) => !value)}
            style={styles.revealButton}
          >
            <Icon name={revealed ? "eye-off-outline" : "eye-outline"} color={colors.secondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[typography.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function DividerRow({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const content = (
    <View style={[styles.row, { borderBottomColor: colors.border }, style]}>{children}</View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed || hovered ? colors.hover : focused ? colors.selected : "transparent",
      })}
    >
      {content}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.empty}>
      <Icon name={icon} size={20} color={colors.faint} />
      <View style={styles.emptyCopy}>
        <Text style={[typography.body, { color: colors.muted }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors.faint }]}>{body}</Text>
      </View>
      {action}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

function SegmentOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [hovered, setHovered] = useState(false);
  const touchSized = Platform.OS !== "web" || width < WIDE_LAYOUT_MIN_WIDTH;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentItem,
        touchSized ? styles.touchSegmentItem : null,
        {
          borderBottomColor: selected ? colors.text : "transparent",
          backgroundColor: pressed || hovered ? colors.hover : "transparent",
        },
      ]}
    >
      <Text
        style={[
          typography.title,
          { color: selected ? colors.text : colors.muted, textTransform: "capitalize" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Segment<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.segment, { borderBottomColor: colors.border }]}>
      {values.map((item) => (
        <SegmentOption
          key={item}
          label={item}
          selected={item === value}
          onPress={() => onChange(item)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: controls.compact,
    minWidth: controls.compact,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  touchButton: { minHeight: controls.comfortable, minWidth: controls.comfortable },
  buttonText: { ...typography.title, fontWeight: "500" },
  field: { gap: 6 },
  inputShell: {
    minHeight: controls.default,
    borderWidth: 1,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  input: { flex: 1, minHeight: controls.default, paddingHorizontal: spacing.sm, ...typography.body },
  revealButton: {
    width: 36,
    minHeight: controls.default,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingBottom: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerCopy: { flex: 1, gap: 4 },
  row: {
    minHeight: 34,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    paddingVertical: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  emptyCopy: { flex: 1, maxWidth: 440, gap: spacing.xxs },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  segment: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  segmentItem: {
    paddingHorizontal: spacing.sm,
    height: controls.compact,
    borderBottomWidth: 2,
    justifyContent: "center",
  },
  touchSegmentItem: { height: controls.comfortable, minWidth: controls.comfortable },
});
