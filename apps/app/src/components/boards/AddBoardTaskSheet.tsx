import type { Task } from "@giraffle/domain";
import { useState } from "react";
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
import { Button, DividerRow, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";

export function AddBoardTaskSheet({
  visible,
  columnTitle,
  tasks,
  onClose,
  onCreate,
  onAdd,
}: {
  visible: boolean;
  columnTitle: string;
  tasks: Task[];
  onClose(): void;
  onCreate(content: string): void;
  onAdd(taskId: string): void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState("");

  const close = () => {
    setDraft("");
    onClose();
  };

  const create = () => {
    const content = draft.trim();
    if (!content) return;
    onCreate(content);
    setDraft("");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close task picker"
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
          onPress={close}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
        >
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text style={[typography.title, { color: colors.text }]}>Add task</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{columnTitle}</Text>
            </View>
            <Button icon="close" accessibilityLabel="Close" onPress={close} />
          </View>

          <View
            style={[
              styles.composer,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={create}
              placeholder="Create a new task"
              placeholderTextColor={colors.faint}
              returnKeyType="done"
              style={[styles.input, typography.body, { color: colors.text }]}
            />
            <Button
              label="Add"
              icon="add"
              tone="accent"
              disabled={!draft.trim()}
              onPress={create}
            />
          </View>

          <Text style={[typography.label, { color: colors.muted }]}>Existing tasks</Text>
          {tasks.length ? (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {tasks.map((task) => (
                <DividerRow
                  key={task.id}
                  onPress={() => {
                    setDraft("");
                    onAdd(task.id);
                  }}
                >
                  <Icon name="ellipse-outline" size={17} color={colors.muted} />
                  <View style={styles.taskCopy}>
                    <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
                      {task.content}
                    </Text>
                    <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
                      {task.sourceLabel}
                    </Text>
                  </View>
                  <Icon name="add" size={17} color={colors.accent} />
                </DividerRow>
              ))}
            </ScrollView>
          ) : (
            <Text style={[typography.body, { color: colors.secondary }]}>No unassigned tasks</Text>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", inset: 0 },
  sheet: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "78%",
    alignSelf: "center",
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headingCopy: { flex: 1, gap: 2 },
  composer: {
    minHeight: 52,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  input: { flex: 1, minWidth: 0 },
  list: { maxHeight: 320 },
  taskCopy: { flex: 1, minWidth: 0 },
});
