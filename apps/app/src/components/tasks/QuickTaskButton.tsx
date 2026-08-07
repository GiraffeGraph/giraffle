import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

export function QuickTaskButton() {
  const { colors } = useTheme();
  const { run } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setDraft("");
  };

  const create = async () => {
    const content = draft.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    try {
      await run((repository) => repository.createInboxTask(content));
      setOpen(false);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        icon="add"
        tone="accent"
        accessibilityLabel="Add task"
        onPress={() => setOpen(true)}
      />
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close new task"
            style={[styles.scrim, { backgroundColor: colors.scrim }]}
            onPress={close}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[styles.sheet, { backgroundColor: colors.surfaceStrong }]}
          >
            <View style={styles.heading}>
              <View style={styles.headingCopy}>
                <Text style={[typography.title, { color: colors.text }]}>New task</Text>
                <Text style={[typography.caption, { color: colors.muted }]}>Inbox · unscheduled</Text>
              </View>
              <Button icon="close" accessibilityLabel="Close" onPress={close} />
            </View>

            <TextInput
              autoFocus
              value={draft}
              editable={!submitting}
              onChangeText={setDraft}
              onSubmitEditing={() => void create()}
              placeholder="What needs doing?"
              placeholderTextColor={colors.faint}
              returnKeyType="done"
              style={[
                styles.input,
                typography.body,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            />

            <View style={styles.actions}>
              <Button label="Cancel" onPress={close} />
              <Button
                label={submitting ? "Adding…" : "Add task"}
                icon="add"
                tone="accent"
                disabled={!draft.trim() || submitting}
                onPress={() => void create()}
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", inset: 0 },
  sheet: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.lg,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headingCopy: { flex: 1, gap: 2 },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
});
