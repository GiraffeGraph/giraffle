import { router, usePathname } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii } from "@/design/tokens";

/** Switches the task screens between the calendar and the priority grid. */
export function TaskViewSwitch() {
  const { colors } = useTheme();
  const path = usePathname();
  const onCalendar = path.startsWith("/stride");

  return (
    <View style={[styles.switch, { borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Calendar view"
        accessibilityState={{ selected: onCalendar }}
        onPress={() => router.push("/stride")}
        style={[
          styles.button,
          { backgroundColor: onCalendar ? colors.accentSubtle : "transparent" },
        ]}
      >
        <Icon
          name="calendar-outline"
          size={17}
          color={onCalendar ? colors.accent : colors.secondary}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Priority view"
        accessibilityState={{ selected: !onCalendar }}
        onPress={() => router.push("/tower")}
        style={[
          styles.button,
          { backgroundColor: onCalendar ? "transparent" : colors.accentSubtle },
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
  button: { width: 36, alignItems: "center", justifyContent: "center" },
});
