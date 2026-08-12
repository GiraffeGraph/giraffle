import { Ionicons } from "@expo/vector-icons";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { controls, radii, spacing, typography } from "@/design/tokens";
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
  const [hovered, setHovered] = useState(false);
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
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: tone === "danger" ? colors.danger : "transparent",
          backgroundColor:
            tone === "accent"
              ? pressed
                ? colors.pressed
                : colors.accent
              : pressed || hovered
                ? colors.hover
                : "transparent",
          opacity: disabled ? 0.42 : pressed ? 0.82 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={17} color={foreground} /> : null}
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

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" style={[typography.heading, { color: colors.text }]}>
          {title}
        </Text>
        {subtitle ? <Text style={[typography.body, { color: colors.secondary }]}>{subtitle}</Text> : null}
      </View>
      {action}
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
  const content = (
    <View style={[styles.row, { borderBottomColor: colors.border }, style]}>{children}</View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed || hovered ? colors.hover : "transparent",
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
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSubtle }]}>
        <Icon name={icon} size={24} color={colors.accent} />
      </View>
      <View style={styles.emptyCopy}>
        <Text style={[typography.title, { color: colors.text }]}>{title}</Text>
        <Text style={[typography.body, { color: colors.secondary }]}>{body}</Text>
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
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentItem,
        {
          backgroundColor: selected
            ? colors.accentSubtle
            : pressed || hovered
              ? colors.hover
              : "transparent",
        },
      ]}
    >
      <Text
        style={[
          typography.label,
          { color: selected ? colors.accent : colors.secondary, textTransform: "capitalize" },
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
  labelFor = (item) => item,
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labelFor?: (value: T) => string;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.segment, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {values.map((item) => (
        <SegmentOption
          key={item}
          label={labelFor(item)}
          selected={item === value}
          onPress={() => onChange(item)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: controls.default,
    minWidth: controls.default,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  buttonText: { ...typography.label },
  field: { gap: 6 },
  inputShell: {
    minHeight: controls.comfortable,
    borderWidth: 1,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  input: { flex: 1, minHeight: controls.comfortable, paddingHorizontal: 12, ...typography.body },
  revealButton: {
    width: 44,
    minHeight: controls.comfortable,
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
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    minHeight: 156,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCopy: { maxWidth: 440, gap: spacing.xs },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  segmentItem: {
    paddingHorizontal: 13,
    height: controls.compact,
    justifyContent: "center",
  },
});
