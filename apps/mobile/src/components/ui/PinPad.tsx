import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { typography } from "@/design/tokens";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const KEY_SIZE = 68;

/**
 * A PIN is short and numeric, so it gets its own pad instead of the system
 * keyboard: fewer taps, no layout shift, and the value never reaches a text
 * field that could offer to remember it.
 */
export function PinPad({
  value,
  length,
  label,
  error,
  disabled = false,
  onChange,
}: {
  value: string;
  length: number;
  label: string;
  error?: string | undefined;
  disabled?: boolean;
  onChange(next: string): void;
}) {
  const { colors } = useTheme();

  const press = (digit: string) => {
    if (disabled || value.length >= length) return;
    onChange(value + digit);
  };

  const backspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  return (
    <View style={styles.pad}>
      <Text style={[typography.label, { color: colors.secondary }]}>{label}</Text>

      <View
        accessibilityRole="text"
        accessibilityLabel={`${value.length} of ${length} digits entered`}
        style={styles.dots}
      >
        {Array.from({ length }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                borderColor: error ? colors.danger : colors.border,
                backgroundColor:
                  index < value.length
                    ? error
                      ? colors.danger
                      : colors.accent
                    : "transparent",
              },
            ]}
          />
        ))}
      </View>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}

      <View style={styles.keys}>
        {KEYS.map((digit) => (
          <PadKey key={digit} label={digit} disabled={disabled} onPress={() => press(digit)} />
        ))}
        <View style={styles.key} />
        <PadKey label="0" disabled={disabled} onPress={() => press("0")} />
        <PadKey
          accessibilityLabel="Delete last digit"
          disabled={disabled || value.length === 0}
          onPress={backspace}
        >
          <Icon name="backspace-outline" size={21} color={colors.secondary} />
        </PadKey>
      </View>
    </View>
  );
}

function PadKey({
  label,
  accessibilityLabel,
  disabled,
  onPress,
  children,
}: {
  label?: string;
  accessibilityLabel?: string;
  disabled: boolean;
  onPress(): void;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: pressed ? colors.hover : "transparent",
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      {children ?? (
        <Text style={[typography.heading, { color: colors.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 14, alignItems: "center" },
  dots: { flexDirection: "row", gap: 14 },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1 },
  keys: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: KEY_SIZE * 3 + 24,
    gap: 6,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
