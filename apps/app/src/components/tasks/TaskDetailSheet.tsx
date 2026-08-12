import type { Task, TaskPriority } from "@giraffle/domain";
import { useState, type ComponentProps } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon, Segment } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";

const priorityLabels = {
  none: "None",
  do: "Focus",
  schedule: "Plan",
  delegate: "Delegate",
  eliminate: "Drop",
} as const;

type PriorityChoice = TaskPriority | "none";
type EditableTaskFields = Pick<
  Task,
  "content" | "description" | "dueDate" | "durationMinutes" | "priority" | "completed"
>;

interface TaskDetailSheetProps {
  task: Task | null;
  boardTitle?: string | null | undefined;
  onClose(): void;
  onSave(patch: Partial<EditableTaskFields>): Promise<void>;
  onOpenSource(): void;
  onRemoveFromBoard?: (() => void) | undefined;
  onDelete(): void;
}

export function TaskDetailSheet(props: TaskDetailSheetProps) {
  if (!props.task) return null;
  return <TaskDetailForm key={props.task.id} {...props} task={props.task} />;
}

function TaskDetailForm({
  task,
  boardTitle,
  onClose,
  onSave,
  onOpenSource,
  onRemoveFromBoard,
  onDelete,
}: Omit<TaskDetailSheetProps, "task"> & { task: Task }) {
  const { colors } = useTheme();
  const [content, setContent] = useState(task.content);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [duration, setDuration] = useState(
    task.durationMinutes === null ? "" : String(task.durationMinutes),
  );
  const [priority, setPriority] = useState<PriorityChoice>(task.priority ?? "none");
  const [completed, setCompleted] = useState(task.completed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      setError("Task text cannot be empty.");
      return;
    }
    const normalizedDue = dueDate.trim();
    if (normalizedDue && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(normalizedDue)) {
      setError("Use YYYY-MM-DD or YYYY-MM-DDTHH:mm for the date.");
      return;
    }
    const parsedDuration = duration.trim() ? Number(duration) : null;
    if (parsedDuration !== null && (!Number.isInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 1_440)) {
      setError("Duration must be between 1 and 1440 minutes.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave({
        content: normalizedContent,
        description: description.trim() || null,
        dueDate: normalizedDue || null,
        durationMinutes: parsedDuration,
        priority: priority === "none" ? null : priority,
        completed,
      });
      onClose();
    } catch {
      setError("The task could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close task details"
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
        >
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text style={[typography.title, { color: colors.text }]}>Task details</Text>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
                {task.sourceLabel}{boardTitle ? ` · ${boardTitle}` : ""}
              </Text>
            </View>
            <Button icon="close" accessibilityLabel="Close" onPress={onClose} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <LabeledInput label="Task" value={content} onChangeText={setContent} multiline />
            <LabeledInput
              label="Description"
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Optional details"
            />
            <View style={styles.row}>
              <View style={styles.flexField}>
                <LabeledInput
                  label="Due date"
                  value={dueDate}
                  onChangeText={setDueDate}
                  placeholder="YYYY-MM-DDTHH:mm"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.durationField}>
                <LabeledInput
                  label="Minutes"
                  value={duration}
                  onChangeText={(value) => setDuration(value.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  placeholder="30"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[typography.label, { color: colors.muted }]}>Priority</Text>
              <Segment
                values={["none", "do", "schedule", "delegate", "eliminate"] as const}
                value={priority}
                onChange={setPriority}
                labelFor={(value) => priorityLabels[value]}
              />
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: completed }}
              onPress={() => setCompleted((value) => !value)}
              style={styles.checkRow}
            >
              <Icon name={completed ? "checkmark-circle" : "ellipse-outline"} color={colors.accent} />
              <Text style={[typography.body, { color: colors.text }]}>Completed</Text>
            </Pressable>

            {error ? (
              <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.danger }]}>
                {error}
              </Text>
            ) : null}

            <View style={styles.secondaryActions}>
              <Button label="Open source" icon="document-text-outline" onPress={onOpenSource} />
              {onRemoveFromBoard ? (
                <Button label="Remove from board" icon="remove-circle-outline" onPress={onRemoveFromBoard} />
              ) : null}
              <Button label="Delete" icon="trash-outline" tone="danger" onPress={onDelete} />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Cancel" onPress={onClose} />
            <Button label={busy ? "Saving…" : "Save"} tone="accent" disabled={busy} onPress={() => void save()} />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LabeledInput({ label, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.faint}
        style={[
          styles.input,
          props.multiline ? styles.multiline : null,
          typography.body,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
          props.style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", inset: 0 },
  sheet: {
    width: "100%",
    maxWidth: 720,
    maxHeight: "92%",
    alignSelf: "center",
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  form: { gap: spacing.md, paddingBottom: spacing.md },
  field: { gap: spacing.xs },
  input: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
  },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  flexField: { flex: 1 },
  durationField: { width: 120 },
  checkRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  secondaryActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
});
