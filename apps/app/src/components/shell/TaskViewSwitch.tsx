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

/** Switches between schedule modes and the priority grid without a second toolbar. */
export function TaskViewSwitch({
  scheduleMode = "day",
  onScheduleModeChange,
}: {
  scheduleMode?: ScheduleViewMode;
  onScheduleModeChange?(mode: ScheduleViewMode): void;
}) {
  const { colors } = useTheme();
  const path = usePathname();
  const onCalendar = path.startsWith("/stride");
  const current = scheduleViews.find((view) => view.value === scheduleMode) ?? scheduleViews[0]!;
  const next = scheduleViews[(scheduleViews.indexOf(current) + 1) % scheduleViews.length]!;

  const openSchedule = () => {
    if (!onCalendar || !onScheduleModeChange) {
      router.push("/stride");
      return;
    }
    onScheduleModeChange(next.value);
  };

  return (
    <View style={[styles.switch, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={onCalendar ? `Switch to ${next.label} view` : "Schedule view"}
        accessibilityState={{ selected: onCalendar }}
        onPress={openSchedule}
        style={({ pressed }) => [
          styles.scheduleButton,
          {
            backgroundColor: onCalendar ? colors.accentSubtle : "transparent",
            opacity: pressed ? 0.58 : 1,
          },
        ]}
      >
        <Icon
          name={onCalendar ? current.icon : "calendar-outline"}
          size={17}
          color={onCalendar ? colors.accent : colors.secondary}
        />
        <Text
          numberOfLines={1}
          style={[
            typography.caption,
            { color: onCalendar ? colors.accent : colors.secondary, fontWeight: "600" },
          ]}
        >
          {onCalendar ? current.label : "Plan"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Priority view"
        accessibilityState={{ selected: !onCalendar }}
        onPress={() => router.push("/tower")}
        style={({ pressed }) => [
          styles.priorityButton,
          {
            backgroundColor: onCalendar ? "transparent" : colors.accentSubtle,
            opacity: pressed ? 0.58 : 1,
          },
        ]}
      >
        <Icon
          name="grid-outline"
          size={17}
          color={onCalendar ? colors.secondary : colors.accent}
        />
      </Pressable>
    </View>
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
  scheduleButton: {
    width: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  priorityButton: { width: 36, alignItems: "center", justifyContent: "center" },
});
