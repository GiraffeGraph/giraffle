import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, DividerRow, Field, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import { isValidPin } from "@/infrastructure/secure-storage/vaultKeys";
import { useApp } from "@/state/AppProvider";

const timeoutOptions = [
  { value: 0, label: "Immediately" },
  { value: 60_000, label: "After 1 minute" },
  { value: 5 * 60_000, label: "After 5 minutes" },
  { value: 15 * 60_000, label: "After 15 minutes" },
  { value: 60 * 60_000, label: "After 1 hour" },
  { value: 24 * 60 * 60_000, label: "After 1 day" },
  { value: -1, label: "Only when I lock it" },
] as const;

export function AccessLockSection() {
  const { colors } = useTheme();
  const { pinEnabled, lockTimeoutMs, setQuickPin, setLockTimeout } = useApp();
  const [editingPin, setEditingPin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const savePin = async () => {
    setMessage(null);
    if (!isValidPin(pin)) {
      setMessage("Enter exactly 4 digits.");
      return;
    }
    if (pin !== confirmation) {
      setMessage("PINs do not match.");
      return;
    }

    setBusy(true);
    try {
      await setQuickPin(pin);
      setPin("");
      setConfirmation("");
      setEditingPin(false);
      setMessage("Quick PIN saved on this device.");
    } catch {
      setMessage("The PIN could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const selectTimeout = async (timeoutMs: number) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await setLockTimeout(timeoutMs);
    } catch {
      setMessage("The lock timing could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const removePin = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await setQuickPin(null);
      setEditingPin(false);
      setPin("");
      setConfirmation("");
      setMessage("Quick PIN removed. Use your full password to unlock.");
    } catch {
      setMessage("The PIN could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text style={[typography.title, { color: colors.text }]}>App lock</Text>
        <Text style={[typography.body, { color: colors.secondary }]}>
          A quick PIN makes frequent unlocks easier. Your full vault password
          still works and should be kept safely.
        </Text>
      </View>

      <DividerRow>
        <Icon name="keypad-outline" />
        <View style={styles.rowCopy}>
          <Text style={[typography.body, { color: colors.text }]}>4-digit quick PIN</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>
            {pinEnabled ? "Enabled on this device" : "Not enabled"}
          </Text>
        </View>
        <Button
          label={pinEnabled ? "Change" : "Set PIN"}
          disabled={busy}
          onPress={() => {
            setEditingPin((value) => !value);
            setMessage(null);
          }}
        />
      </DividerRow>

      {editingPin ? (
        <View style={[styles.pinEditor, { borderBottomColor: colors.border }]}>
          <Field
            label={pinEnabled ? "New PIN" : "PIN"}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            value={pin}
            onChangeText={(value) => setPin(value.replace(/\D/g, ""))}
          />
          <Field
            label="Confirm PIN"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            value={confirmation}
            onChangeText={(value) =>
              setConfirmation(value.replace(/\D/g, ""))
            }
          />
          <View style={styles.actions}>
            <Button
              label="Save PIN"
              tone="accent"
              disabled={busy || pin.length !== 4 || confirmation.length !== 4}
              onPress={() => void savePin()}
            />
            <Button
              label="Cancel"
              onPress={() => {
                setEditingPin(false);
                setPin("");
                setConfirmation("");
              }}
            />
          </View>
        </View>
      ) : null}

      {pinEnabled ? (
        <Button
          label="Remove quick PIN"
          icon="remove-circle-outline"
          tone="danger"
          disabled={busy}
          onPress={() => void removePin()}
        />
      ) : null}

      <View style={styles.timeout}>
        <Text style={[typography.label, { color: colors.muted }]}>Lock after leaving Giraffle</Text>
        {timeoutOptions.map((option) => (
          <DividerRow
            key={option.value}
            onPress={() => void selectTimeout(option.value)}
          >
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
              {option.label}
            </Text>
            {lockTimeoutMs === option.value ? (
              <Icon name="checkmark" color={colors.accent} />
            ) : null}
          </DividerRow>
        ))}
      </View>

      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            typography.body,
            { color: message.includes("could not") || message.includes("do not") ? colors.danger : colors.secondary },
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  intro: { gap: spacing.xs },
  rowCopy: { flex: 1, gap: 2 },
  pinEditor: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  timeout: { gap: spacing.xs },
});
