import { Redirect } from "expo-router";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PinPad } from "@/components/ui/PinPad";
import { Button, Field, Loading } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { isValidPin } from "@/infrastructure/secure-storage/accessLock";
import { useApp } from "@/state/AppProvider";

type UnlockMode = "pin" | "passphrase";

export default function VaultEntry() {
  const { colors } = useTheme();
  const { phase, error: startupError, pinEnabled, createVault, unlock } = useApp();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [usePin, setUsePin] = useState(false);
  // Null means "not chosen yet", so a vault with a PIN opens on the pad.
  const [unlockMode, setUnlockMode] = useState<UnlockMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  if (phase === "ready" && !recoveryCode) {
    return <Redirect href="/notes" />;
  }

  if (phase === "booting") {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <Loading />
      </View>
    );
  }

  if (phase === "error") {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <View
            style={[
              styles.panel,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[typography.heading, { color: colors.text }]}>
              Giraffle could not open
            </Text>
            <Text style={[typography.body, { color: colors.danger }]}>
              {startupError ?? "Encrypted storage is unavailable on this device."}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isNewWorkspace = phase === "onboarding";
  const usingPin = !isNewWorkspace && pinEnabled && (unlockMode ?? "pin") === "pin";

  const submit = async (pinOverride?: string) => {
    const currentPin = pinOverride ?? pin;
    setError(null);
    if (isNewWorkspace && password.length < 12) {
      setError("Use 12 or more characters");
      return;
    }
    if (isNewWorkspace && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (isNewWorkspace && usePin && !isValidPin(currentPin)) {
      setError("PIN must contain exactly 4 digits");
      return;
    }
    if (isNewWorkspace && usePin && currentPin !== confirmPin) {
      setError("PINs do not match");
      return;
    }
    if (usingPin && !isValidPin(currentPin)) {
      setError("Enter your 4-digit PIN");
      return;
    }

    setBusy(true);
    try {
      if (isNewWorkspace) {
        const session = await createVault(password, usePin ? currentPin : undefined);
        setRecoveryCode(session.recoveryCode ?? null);
      } else {
        await unlock(usingPin ? currentPin : password, usingPin ? "pin" : "passphrase");
      }
    } catch (cause) {
      const temporarilyBlocked =
        cause instanceof Error && cause.message === "Quick PIN is temporarily unavailable";
      if (isNewWorkspace) console.error("[giraffle:setup]", cause);
      setError(
        isNewWorkspace
          ? "Setup could not be completed. Please try again."
          : temporarilyBlocked
            ? "Too many PIN attempts. Wait 30 seconds or use your full password."
            : usingPin
              ? "That PIN did not work."
              : "That password did not work.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCode) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <View
            style={[
              styles.panel,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[typography.heading, { color: colors.text }]}>
              Save your backup code
            </Text>
            <Text style={[typography.body, { color: colors.secondary }]}>
              Keep this code somewhere safe. You may need it if you lose access
              to your devices.
            </Text>
            <Text
              selectable
              style={[
                styles.recovery,
                {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              {recoveryCode}
            </Text>
            <Button
              label="I saved it"
              tone="accent"
              onPress={() => setRecoveryCode(null)}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.scrollCenter}
        >
          <View style={styles.brand}>
            <Image source={require("../assets/icon.png")} style={styles.logo} />
            <View>
              <Text style={[typography.heading, { color: colors.text }]}>Giraffle</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>
                Your private workspace
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.panel,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[typography.title, { color: colors.text }]}>
              {isNewWorkspace ? "Set up Giraffle" : "Open Giraffle"}
            </Text>
            <Text style={[typography.body, { color: colors.secondary }]}>
              {isNewWorkspace
                ? "Your notes stay private on this device. Encrypted server backup is optional."
                : usingPin
                  ? "Use your quick PIN. Your full password remains available as a fallback."
                  : "Enter your vault password to open your notes."}
            </Text>

            {usingPin ? (
              <PinPad
                label="Quick PIN"
                length={4}
                value={pin}
                disabled={busy}
                {...(error ? { error } : {})}
                onChange={(next) => {
                  setPin(next);
                  setError(null);
                  // The PIN is fixed length, so the last digit is the submit.
                  if (next.length === 4) void submit(next);
                }}
              />
            ) : (
              <>
                <Field
                  label="Password"
                  secureTextEntry
                  revealable
                  autoCapitalize="none"
                  value={password}
                  onChangeText={setPassword}
                  {...(error ? { error } : {})}
                />
                {isNewWorkspace ? (
                  <Field
                    label="Confirm password"
                    secureTextEntry
                    revealable
                    autoCapitalize="none"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                ) : null}
              </>
            )}

            {isNewWorkspace && usePin ? (
              <View style={styles.pinFields}>
                <Field
                  label="Quick PIN"
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={4}
                  value={pin}
                  onChangeText={(value) => setPin(value.replace(/\D/g, ""))}
                />
                <Field
                  label="Confirm quick PIN"
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={4}
                  value={confirmPin}
                  onChangeText={(value) =>
                    setConfirmPin(value.replace(/\D/g, ""))
                  }
                />
                <Text style={[typography.caption, { color: colors.muted }]}>
                  The PIN is only for faster access on this device. Keep your
                  full password and backup code.
                </Text>
              </View>
            ) : null}

            {isNewWorkspace ? (
              <Button
                label={usePin ? "Remove quick PIN" : "Add a 4-digit quick PIN"}
                icon={usePin ? "remove-circle-outline" : "keypad-outline"}
                onPress={() => {
                  setUsePin((value) => !value);
                  setPin("");
                  setConfirmPin("");
                  setError(null);
                }}
              />
            ) : pinEnabled ? (
              <Button
                label={usingPin ? "Use full password" : "Use quick PIN"}
                icon={usingPin ? "key-outline" : "keypad-outline"}
                onPress={() => {
                  setUnlockMode(usingPin ? "passphrase" : "pin");
                  setError(null);
                }}
              />
            ) : null}

            {usingPin ? null : (
              <Button
                label={busy ? "Please wait…" : isNewWorkspace ? "Continue" : "Open"}
                icon="lock-open-outline"
                tone="accent"
                disabled={busy || password.length < 1}
                onPress={() => void submit()}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 460,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  scrollCenter: {
    flexGrow: 1,
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 460,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 46, height: 46, borderRadius: 12 },
  panel: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  pinFields: { gap: spacing.md },
  recovery: {
    padding: 16,
    borderWidth: 1,
    borderRadius: radii.sm,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 13,
    lineHeight: 21,
  },
});
