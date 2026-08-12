import { router, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, typography } from "@/design/tokens";

export type ScheduleViewMode = "day" | "week" | "month";

const scheduleViews: readonly {
  value: ScheduleViewMode;
  label: string;
  icon: IconName;
}[] = [
  { value: "day", label: "Day", icon: "today-outline" },
  { value: "week", label: "Week", icon: "calendar-outline" },
  { value: "month", label: "Month", icon: "calendar-number-outline" },
];

export function TaskViewSwitch({
  scheduleMode = "day",
  onScheduleModeChange,
}: {
  scheduleMode?: ScheduleViewMode;
  onScheduleModeChange?(mode: ScheduleViewMode): void;
}) {
  const { colors } = useTheme();
  const path = usePathname();
  const onList = path === "/tasks";
  const onCalendar = path.startsWith("/tasks/calendar");
  const onPriority = path.startsWith("/tasks/priority");
  const current = scheduleViews.find((view) => view.value === scheduleMode) ?? scheduleViews[0]!;
  const next = scheduleViews[(scheduleViews.indexOf(current) + 1) % scheduleViews.length]!;

  const openCalendar = () => {
    if (!onCalendar || !onScheduleModeChange) {
      router.push("/tasks/calendar");
      return;
    }
    onScheduleModeChange(next.value);
  };

  return (
    <View style={[styles.switch, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <SwitchButton
        selected={onList}
        label="List"
        icon="list-outline"
        onPress={() => router.push("/tasks")}
      />
      <SwitchButton
        selected={onCalendar}
        label={onCalendar ? current.label : "Plan"}
        icon={onCalendar ? current.icon : "calendar-outline"}
        accessibilityLabel={onCalendar ? `Switch to ${next.label} view` : "Calendar view"}
        onPress={openCalendar}
      />
      <SwitchButton
        selected={onPriority}
        label="Priority"
        icon="grid-outline"
        onPress={() => router.push("/tasks/priority")}
      />
    </View>
  );
}

function SwitchButton({
  selected,
  label,
  icon,
  accessibilityLabel,
  onPress,
}: {
  selected: boolean;
  label: string;
  icon: IconName;
  accessibilityLabel?: string;
  onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label} view`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: selected ? colors.accentSubtle : "transparent",
          opacity: pressed ? 0.58 : 1,
        },
      ]}
    >
      <Icon name={icon} size={16} color={selected ? colors.accent : colors.secondary} />
      <Text
        numberOfLines={1}
        style={[
          typography.caption,
          { color: selected ? colors.accent : colors.secondary, fontWeight: "600" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switch: {
    height: 34,
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  button: {
    minWidth: 70,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
});
