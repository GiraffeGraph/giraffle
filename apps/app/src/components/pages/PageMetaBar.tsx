import { parseDue, type Page } from "@giraffle/domain";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PlanningField } from "@/components/pages/PagePlanningSheet";
import { Icon, type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const priorityLabels: Record<string, string> = {
  do: "Focus",
  schedule: "Plan",
  delegate: "Delegate",
  eliminate: "Drop",
};

const scheduleLabel = (value: string, durationMinutes: number | null): string => {
  const due = parseDue(value);
  if (!due) return value;
  const date = new Date(`${due.day}T12:00:00`);
  const shown = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = due.minutes === null
    ? "All day"
    : new Date(2000, 0, 1, Math.floor(due.minutes / 60), due.minutes % 60).toLocaleTimeString(
        undefined,
        { hour: "numeric", minute: "2-digit" },
      );
  return [shown, time, due.minutes === null ? null : durationMinutes ? `${durationMinutes}m` : null]
    .filter(Boolean)
    .join(" · ");
};

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  onPress(): void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed || hovered ? colors.hover : "transparent" },
      ]}
    >
      <View style={styles.label}>
        <Icon name={icon} size={14} color={colors.muted} />
        <Text numberOfLines={1} style={[typography.body, { flex: 1, color: colors.muted }]}>
          {label}
        </Text>
      </View>
      <Text numberOfLines={1} style={[typography.body, { flex: 1, color: colors.text }]}>
        {value}
      </Text>
    </Pressable>
  );
}

function AddProperty({
  missing,
  onOpen,
}: {
  missing: readonly PlanningField[];
  onOpen(field: PlanningField): void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  if (!missing.length) return null;

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a page property"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.add,
          { backgroundColor: pressed ? colors.hover : "transparent" },
        ]}
      >
        <Icon name="add" size={14} color={colors.faint} />
        <Text style={[typography.caption, { color: colors.faint }]}>Add property</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.addChoices}>
      {missing.includes("priority") ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add priority"
          onPress={() => {
            setOpen(false);
            onOpen("priority");
          }}
          style={({ pressed }) => [
            styles.choice,
            { backgroundColor: pressed ? colors.hover : "transparent" },
          ]}
        >
          <Icon name="flag-outline" size={14} color={colors.muted} />
          <Text style={[typography.body, { color: colors.text }]}>Priority</Text>
        </Pressable>
      ) : null}
      {missing.includes("schedule") ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add date"
          onPress={() => {
            setOpen(false);
            onOpen("schedule");
          }}
          style={({ pressed }) => [
            styles.choice,
            { backgroundColor: pressed ? colors.hover : "transparent" },
          ]}
        >
          <Icon name="calendar-outline" size={14} color={colors.muted} />
          <Text style={[typography.body, { color: colors.text }]}>Date</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PageMetaBar({
  page,
  onOpenPlanning,
}: {
  page: Page;
  onOpenPlanning(field: PlanningField): void;
}) {
  const { snapshot } = useApp();
  const state = snapshot.states.find((item) => item.id === page.stateId);
  const missing: PlanningField[] = [];
  if (!page.priority) missing.push("priority");
  if (!page.scheduledAt) missing.push("schedule");

  return (
    <View style={styles.block}>
      <Row
        icon={
          state?.family === "done"
            ? "checkmark-circle-outline"
            : state?.family === "open"
              ? "ellipse-outline"
              : "bookmark-outline"
        }
        label="State"
        value={state?.title ?? "Unknown"}
        onPress={() => onOpenPlanning("state")}
      />
      {page.priority ? (
        <Row
          icon="flag-outline"
          label="Priority"
          value={priorityLabels[page.priority] ?? page.priority}
          onPress={() => onOpenPlanning("priority")}
        />
      ) : null}
      {page.scheduledAt ? (
        <Row
          icon="calendar-outline"
          label="Date"
          value={scheduleLabel(page.scheduledAt, page.durationMinutes)}
          onPress={() => onOpenPlanning("schedule")}
        />
      ) : null}
      <AddProperty missing={missing} onOpen={onOpenPlanning} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.sm, marginBottom: spacing.md },
  row: {
    minHeight: 30,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    width: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  add: {
    alignSelf: "flex-start",
    minHeight: 28,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  addChoices: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
  },
  choice: {
    minHeight: 28,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
