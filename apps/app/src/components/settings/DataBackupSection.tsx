import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Field } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import {
  createArchiveFileWriter,
  pickArchiveFile,
  type PickedArchiveFile,
} from "@/infrastructure/archive/archiveFile";
import type { VaultArchiveSummary } from "@/infrastructure/archive/vaultArchive";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useApp } from "@/state/AppProvider";

type Mode = "export" | "import-password" | "import-confirm" | null;

function backupName(): string {
  return `Giraffle-${new Date().toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z")}.giraffle`;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The backup operation failed";
}

export function DataBackupSection() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { snapshot, createBackup, inspectBackup, restoreBackup } = useApp();
  const tell = useConfirm();
  const isWideWeb = Platform.OS === "web" && width >= 768;
  const [mode, setMode] = useState<Mode>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [picked, setPicked] = useState<PickedArchiveFile | null>(null);
  const [summary, setSummary] = useState<VaultArchiveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    if (busy) return;
    picked?.bytes.fill(0);
    setMode(null);
    setPassphrase("");
    setConfirmation("");
    setPicked(null);
    setSummary(null);
    setError(null);
  };

  const beginImport = async () => {
    if (snapshot.pages.length > 0 || snapshot.canvases.length > 0) {
      await tell({
        title: "Empty workspace required",
        body: "Backups are restored into a new empty workspace. They are never merged with existing data.",
        acknowledge: true,
      });
      return;
    }
    setBusy(true);
    try {
      const file = await pickArchiveFile();
      if (!file) return;
      setPicked(file);
      setPassphrase("");
      setError(null);
      setMode("import-password");
    } catch (cause) {
      await tell({
        title: "Backup could not be opened",
        body: message(cause),
        acknowledge: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    if (busy) return;
    if (passphrase.length < 12) {
      setError("Use 12 or more characters.");
      return;
    }
    if (passphrase !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    let bytes: Uint8Array | null = null;
    try {
      const writer = await createArchiveFileWriter(backupName());
      if (!writer) return;
      bytes = await createBackup(passphrase);
      await writer(bytes);
      resetAfterSuccess();
      await tell({
        title: "Backup ready",
        body: "The encrypted workspace backup was created.",
        acknowledge: true,
      });
    } catch (cause) {
      setError(message(cause));
    } finally {
      bytes?.fill(0);
      setBusy(false);
    }
  };

  const inspectImport = async () => {
    if (!picked || busy) return;
    if (!passphrase) {
      setError("Enter the backup password.");
      return;
    }
    setBusy(true);
    try {
      setSummary(await inspectBackup(picked.bytes, passphrase));
      setError(null);
      setMode("import-confirm");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    if (!picked || !summary || busy) return;
    setBusy(true);
    try {
      const restored = await restoreBackup(picked.bytes, passphrase);
      resetAfterSuccess();
      await tell({
        title: "Backup restored",
        body: `${restored.pages} pages, ${restored.categories} categories and ${restored.canvases} canvases were imported.`,
        acknowledge: true,
      });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const resetAfterSuccess = () => {
    picked?.bytes.fill(0);
    setMode(null);
    setPassphrase("");
    setConfirmation("");
    setPicked(null);
    setSummary(null);
    setError(null);
  };

  const title =
    mode === "export"
      ? "Export encrypted backup"
      : mode === "import-confirm"
        ? "Import this backup?"
        : "Open encrypted backup";

  return (
    <View style={styles.section}>
      <Text style={[typography.label, styles.sectionLabel, { color: colors.faint }]}>Backup</Text>
      <Button
        label="Export workspace"
        icon="download-outline"
        disabled={busy}
        onPress={() => {
          setMode("export");
          setError(null);
        }}
      />
      <Button
        label={busy && mode === null ? "Opening…" : "Import workspace"}
        icon="push-outline"
        disabled={busy}
        onPress={() => void beginImport()}
      />

      <Modal
        visible={mode !== null}
        transparent
        animationType={isWideWeb ? "fade" : "slide"}
        onRequestClose={reset}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalRoot, isWideWeb && styles.modalRootWide]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close backup dialog"
            style={[styles.scrim, { backgroundColor: colors.scrim }]}
            onPress={reset}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.sheet,
              isWideWeb && styles.sheetWide,
              { backgroundColor: colors.surfaceStrong },
            ]}
          >
            <View style={styles.heading}>
              <View style={styles.headingCopy}>
                <Text style={[typography.title, { color: colors.text }]}>{title}</Text>
                {mode === "import-password" && picked ? (
                  <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
                    {picked.name}
                  </Text>
                ) : null}
              </View>
              <Button icon="close" accessibilityLabel="Close" disabled={busy} onPress={reset} />
            </View>

            {mode === "export" ? (
              <>
                <Field
                  label="Backup password"
                  value={passphrase}
                  onChangeText={setPassphrase}
                  secureTextEntry
                  revealable
                  editable={!busy}
                  autoCapitalize="none"
                />
                <Field
                  label="Confirm password"
                  value={confirmation}
                  onChangeText={setConfirmation}
                  secureTextEntry
                  revealable
                  editable={!busy}
                  autoCapitalize="none"
                  {...(error ? { error } : {})}
                />
              </>
            ) : null}

            {mode === "import-password" ? (
              <Field
                autoFocus
                label="Backup password"
                value={passphrase}
                onChangeText={setPassphrase}
                secureTextEntry
                revealable
                editable={!busy}
                autoCapitalize="none"
                {...(error ? { error } : {})}
              />
            ) : null}

            {mode === "import-confirm" && summary ? (
              <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[typography.body, { color: colors.text }]}>
                  {summary.pages} pages · {summary.states} states
                </Text>
                <Text style={[typography.body, { color: colors.text }]}>
                  {summary.categories} categories · {summary.canvases} canvases
                </Text>
                <Text style={[typography.caption, { color: colors.muted }]}>
                  Exported {new Date(summary.exportedAt).toLocaleString()}
                </Text>
              </View>
            ) : null}

            {mode === "import-confirm" && error ? (
              <Text style={[typography.caption, { color: colors.danger }]}>{error}</Text>
            ) : null}

            <View style={styles.actions}>
              <Button label="Cancel" disabled={busy} onPress={reset} />
              {mode === "export" ? (
                <Button
                  label={busy ? "Encrypting…" : "Export"}
                  icon="lock-closed-outline"
                  tone="accent"
                  disabled={busy || !passphrase || !confirmation}
                  onPress={() => void exportBackup()}
                />
              ) : null}
              {mode === "import-password" ? (
                <Button
                  label={busy ? "Checking…" : "Continue"}
                  icon="arrow-forward"
                  tone="accent"
                  disabled={busy || !passphrase}
                  onPress={() => void inspectImport()}
                />
              ) : null}
              {mode === "import-confirm" ? (
                <Button
                  label={busy ? "Importing…" : "Import"}
                  icon="push-outline"
                  tone="accent"
                  disabled={busy}
                  onPress={() => void importBackup()}
                />
              ) : null}
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionLabel: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalRootWide: { justifyContent: "center", padding: spacing.xl },
  scrim: { position: "absolute", inset: 0 },
  sheet: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "90%",
    alignSelf: "center",
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.lg,
  },
  sheetWide: { borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  summary: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
});
