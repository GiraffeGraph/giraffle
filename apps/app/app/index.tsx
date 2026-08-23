import { Redirect, router } from "expo-router";
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
import { isValidPin } from "@/infrastructure/secure-storage/vaultKeys";
import { useApp } from "@/state/AppProvider";

type UnlockMode = "pin" | "passphrase" | "recovery";

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
    return <Redirect href="/today" />;
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
          <View style={styles.panel}>
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
        await unlock(usingPin ? currentPin : password, usingPin ? "pin" : unlockMode === "recovery" ? "recovery" : "passphrase");
      }
    } catch (cause) {
      const temporarilyBlocked =
        cause instanceof Error && cause.message === "Quick PIN is temporarily unavailable";
      if (isNewWorkspace) console.error("[giraffle:setup]", cause);
      const credentialRejected =
        cause instanceof Error &&
        (cause.message === "PIN did not unlock this vault" ||
          cause.message === "Passphrase did not unlock this vault" ||
          cause.message === "Recovery code did not unlock this vault");
      if (!isNewWorkspace && !temporarilyBlocked && !credentialRejected) {
        console.error("[giraffle:unlock]", cause);
      }
      setError(
        isNewWorkspace
          ? "Setup could not be completed. Please try again."
          : temporarilyBlocked
            ? "Too many PIN attempts. Wait 30 seconds or use your full password."
            : credentialRejected
              ? usingPin
                ? "That PIN did not work."
                : "That password did not work."
              : "Your password worked, but the vault could not be opened. Reset this local workspace or restore a backup.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCode) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <View style={styles.panel}>
            <Text style={[typography.heading, { color: colors.text }]}>
              Save your recovery code
            </Text>
            <Text style={[typography.body, { color: colors.secondary }]}>
              This code opens the vault on this device if you forget your
              password. It is sealed to this device, so it cannot recover a
              device you no longer have — that is what an encrypted backup is
              for. It is shown once.
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
            <Image source={require("../assets/brand-mark.png")} style={styles.logo} />
            <View>
              <Text style={[typography.heading, { color: colors.text }]}>Giraffle</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>
                Your private workspace
              </Text>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={[typography.title, { color: colors.text }]}>
              {isNewWorkspace ? "Set up Giraffle" : "Open Giraffle"}
            </Text>
            <Text style={[typography.body, { color: colors.secondary }]}>
              {isNewWorkspace
                ? "Your content stays private on this device. Encrypted server backup is optional."
                : usingPin
                  ? "Use your quick PIN. Your full password remains available as a fallback."
                  : "Enter your vault password to open your workspace."}
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
                  full password and recovery code.
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
            ) : (
              <>
                {pinEnabled ? (
                  <Button
                    label={usingPin ? "Use full password" : "Use quick PIN"}
                    icon={usingPin ? "key-outline" : "keypad-outline"}
                    onPress={() => {
                      setUnlockMode(usingPin ? "passphrase" : "pin");
                      setPassword("");
                      setError(null);
                    }}
                  />
                ) : null}
                <Button
                  label={
                    unlockMode === "recovery" ? "Use full password" : "Use recovery code"
                  }
                  icon={unlockMode === "recovery" ? "key-outline" : "shield-checkmark-outline"}
                  onPress={() => {
                    setUnlockMode(unlockMode === "recovery" ? "passphrase" : "recovery");
                    setPassword("");
                    setError(null);
                  }}
                />
              </>
            )}

            {usingPin ? null : (
              <Button
                label={busy ? "Please wait…" : isNewWorkspace ? "Continue" : "Open"}
                icon="lock-open-outline"
                tone="accent"
                disabled={busy || password.length < 1}
                onPress={() => void submit()}
              />
            )}

            {isNewWorkspace ? (
              <Button
                label="I already use Giraffle on another device"
                icon="link-outline"
                disabled={busy}
                onPress={() => router.push("/join")}
              />
            ) : null}
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
    maxWidth: 380,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  scrollCenter: {
    flexGrow: 1,
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 380,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: { width: 32, height: 32, borderRadius: radii.sm },
  panel: { gap: spacing.lg },
  pinFields: { gap: spacing.md },
  recovery: {
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 13,
    lineHeight: 21,
  },
});
