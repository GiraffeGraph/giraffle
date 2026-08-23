import type { Page, PagePriority } from "@giraffle/domain";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon, type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { controls, layout, radii, spacing, typography, WIDE_LAYOUT_MIN_WIDTH } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

/** Which property was pressed. A page's plan is edited one field at a time. */
export type PlanningField = "state" | "priority" | "schedule";

const priorityLabels = { do: "Focus", schedule: "Plan", delegate: "Delegate", eliminate: "Drop" } as const;
const priorities = ["do", "schedule", "delegate", "eliminate"] as const satisfies readonly PagePriority[];

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = (value: string | null) => {
  if (!value) return { day: "", time: "" };
  const [day, time = ""] = value.split("T");
  return { day: day ?? "", time: time.slice(0, 5) };
};
const moveMonth = (value: Date, amount: number) => new Date(value.getFullYear(), value.getMonth() + amount, 1);
const monthCells = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value;
  });
};

/**
 * Notion's property menu: what you press is what you get, and picking a value
 * is the whole interaction — there is nothing left to save afterwards, so the
 * panel carries no Save button and no second thought.
 */
export function PagePlanningSheet({
  page,
  field,
  visible,
  onClose,
}: {
  page: Page;
  field: PlanningField;
  visible: boolean;
  onClose(): void;
}) {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const scheduled = parse(page.scheduledAt);
  const [month, setMonth] = useState(() =>
    scheduled.day ? new Date(`${scheduled.day}T12:00:00`) : new Date(),
  );

  const write = (patch: Partial<Pick<Page, "stateId" | "priority" | "scheduledAt" | "durationMinutes">>) =>
    void run((repository) => repository.updatePage(page.id, patch)).catch(() => undefined);

  const pickDay = (value: string) => {
    write({ scheduledAt: value ? (scheduled.time ? `${value}T${scheduled.time}` : value) : null });
  };

  const pickTime = (value: string) => {
    if (!scheduled.day) return;
    write({ scheduledAt: value ? `${scheduled.day}T${value}` : scheduled.day });
  };

  const body =
    field === "state" ? (
      <View style={styles.rows}>
        {snapshot.states.map((state) => (
          <Choice
            key={state.id}
            icon={
              state.family === "done"
                ? "checkmark-circle-outline"
                : state.family === "open"
                  ? "ellipse-outline"
                  : "bookmark-outline"
            }
            label={state.title}
            selected={page.stateId === state.id}
            onPress={() => {
              write({ stateId: state.id });
              onClose();
            }}
          />
        ))}
      </View>
    ) : field === "priority" ? (
      <View style={styles.rows}>
        {priorities.map((value) => (
          <Choice
            key={value}
            icon="flag-outline"
            label={priorityLabels[value]}
            selected={page.priority === value}
            onPress={() => {
              write({ priority: value });
              onClose();
            }}
          />
        ))}
        <Choice
          icon="remove-outline"
          label="No priority"
          selected={page.priority === null}
          onPress={() => {
            write({ priority: null });
            onClose();
          }}
        />
      </View>
    ) : (
      <View style={styles.schedule}>
        <View style={styles.quick}>
          {[
            { label: "Today", days: 0 },
            { label: "Tomorrow", days: 1 },
            { label: "Next week", days: 7 },
          ].map((item) => (
            <Button
              key={item.label}
              label={item.label}
              onPress={() => {
                const value = new Date();
                value.setDate(value.getDate() + item.days);
                setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
                pickDay(dateKey(value));
              }}
            />
          ))}
        </View>

        <View style={styles.calendarHead}>
          <Button
            icon="chevron-back"
            accessibilityLabel="Previous month"
            onPress={() => setMonth((value) => moveMonth(value, -1))}
          />
          <Text style={[typography.title, styles.month, { color: colors.text }]}>
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <Button
            icon="chevron-forward"
            accessibilityLabel="Next month"
            onPress={() => setMonth((value) => moveMonth(value, 1))}
          />
        </View>

        <View style={styles.week}>
          {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
            <Text
              key={`${label}-${index}`}
              style={[typography.caption, styles.dayLabel, { color: colors.faint }]}
            >
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {monthCells(month).map((date) => {
            const key = dateKey(date);
            const selected = key === scheduled.day;
            const inMonth = date.getMonth() === month.getMonth();
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key}
                accessibilityState={{ selected }}
                onPress={() => pickDay(key)}
                style={[styles.day, { backgroundColor: selected ? colors.accent : "transparent" }]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: selected ? colors.accentInk : inMonth ? colors.text : colors.faint,
                      fontWeight: selected ? "700" : "400",
                    },
                  ]}
                >
                  {date.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.timeRow}>
          <Text style={[typography.body, { color: colors.muted, flex: 1 }]}>Time</Text>
          {Platform.OS === "web" ? (
            <input
              aria-label="Time"
              type="time"
              value={scheduled.time}
              disabled={!scheduled.day}
              onChange={(event) => pickTime(event.target.value)}
              style={{
                height: controls.default,
                padding: "0 8px",
                borderRadius: radii.sm,
                border: `1px solid ${colors.border}`,
                color: colors.text,
                background: colors.surface,
                font: "inherit",
                colorScheme: colors.background.startsWith("#1") ? "dark" : "light",
              }}
            />
          ) : (
            <TextInput
              accessibilityLabel="Time"
              value={scheduled.time}
              editable={Boolean(scheduled.day)}
              onChangeText={pickTime}
              placeholder="09:30"
              keyboardType="numbers-and-punctuation"
              placeholderTextColor={colors.faint}
              style={[styles.input, typography.body, { color: colors.text, borderColor: colors.border }]}
            />
          )}
        </View>

        <View style={styles.timeRow}>
          <Text style={[typography.body, { color: colors.muted, flex: 1 }]}>Duration</Text>
          {[15, 30, 60, 90].map((value) => (
            <Button
              key={value}
              label={`${value}m`}
              tone={page.durationMinutes === value ? "accent" : "quiet"}
              onPress={() => write({ durationMinutes: page.durationMinutes === value ? null : value })}
            />
          ))}
        </View>

        {page.scheduledAt ? (
          <Choice
            icon="close"
            label="Clear date"
            tone="danger"
            onPress={() => {
              write({ scheduledAt: null, durationMinutes: null });
              onClose();
            }}
          />
        ) : null}
      </View>
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={wide ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={[styles.scrim, { backgroundColor: wide ? "transparent" : colors.scrim }]}
      />
      {wide ? (
        <View pointerEvents="box-none" style={styles.centre}>
          <View
            style={[styles.panel, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}
          >
            {body}
          </View>
        </View>
      ) : (
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
        >
          {body}
        </SafeAreaView>
      )}
    </Modal>
  );
}

function Choice({
  icon,
  label,
  selected = false,
  tone,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected?: boolean;
  tone?: "danger";
  onPress(): void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: pressed || hovered ? colors.hover : "transparent" },
      ]}
    >
      <Icon name={icon} size={16} color={tone ? colors.danger : colors.faint} />
      <Text
        numberOfLines={1}
        style={[typography.body, { flex: 1, color: tone ? colors.danger : colors.text }]}
      >
        {label}
      </Text>
      {selected ? <Icon name="checkmark" size={15} color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", inset: 0 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  panel: {
    width: 300,
    paddingVertical: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  sheet: { marginTop: "auto", borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingTop: spacing.xs },
  rows: { paddingVertical: spacing.xxs },
  choice: {
    height: 32,
    paddingHorizontal: spacing.sm,
    marginHorizontal: spacing.xs,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  schedule: { padding: spacing.sm, gap: spacing.sm },
  quick: { flexDirection: "row", gap: spacing.xs },
  calendarHead: { minHeight: layout.rowHeight, flexDirection: "row", alignItems: "center" },
  month: { flex: 1, textAlign: "center" },
  week: { flexDirection: "row" },
  dayLabel: { width: `${100 / 7}%`, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  day: {
    width: `${100 / 7}%`,
    aspectRatio: 1.15,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  timeRow: { minHeight: controls.compact, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  input: {
    minHeight: controls.default,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
  },
});
