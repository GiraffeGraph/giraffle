import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Field } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp, type PendingJoin } from "@/state/AppProvider";

const POLL_INTERVAL_MS = 3_000;

export default function JoinVault() {
  const { colors } = useTheme();
  const { phase, beginJoin, completeJoin, cancelJoin } = useApp();
  const [serverAddress, setServerAddress] = useState("");
  const [connectionCode, setConnectionCode] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<PendingJoin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Approval happens on the other device, so this one keeps asking.
  useEffect(() => {
    if (!pending) return;
    let active = true;
    const timer = setInterval(() => {
      void completeJoin().catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "The connection failed");
      });
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pending, completeJoin]);

  if (phase === "ready") return <Redirect href="/pages" />;

  const start = async () => {
    setError(null);
    let parsed: URL;
    try {
      parsed = new URL(serverAddress);
    } catch {
      setError("Enter a valid server address.");
      return;
    }
    const localHttp =
      parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password) {
      setError("Use HTTPS. Unencrypted HTTP is allowed only for localhost.");
      return;
    }
    if (password.length < 12) {
      setError("Use 12 or more characters for this device's password.");
      return;
    }

    setBusy(true);
    try {
      setPending(
        await beginJoin({
          server: { baseUrl: serverAddress, token: connectionCode },
          vaultId: vaultId.trim(),
          passphrase: password,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This device could not ask to join.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    void cancelJoin().finally(() => {
      setPending(null);
      router.replace("/");
    });
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.panel}>
            <Text style={[typography.title, { color: colors.text }]}>
              {pending ? "Waiting for your other device" : "Join an existing vault"}
            </Text>

            {pending ? (
              <>
                <Text style={[typography.body, { color: colors.secondary }]}>
                  On the device that already has your workspace, open Settings, then Devices, and approve
                  this one. Check that it shows exactly this number before you approve.
                </Text>
                <Text
                  selectable
                  style={[
                    styles.fingerprint,
                    { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  {pending.fingerprint}
                </Text>
                <Text style={[typography.caption, { color: colors.muted }]}>
                  If the numbers differ, stop. Someone between you and the server may be trying to
                  join in your place.
                </Text>
                <Button label="Cancel" tone="danger" onPress={cancel} />
              </>
            ) : (
              <>
                <Text style={[typography.body, { color: colors.secondary }]}>
                  {"Your workspace stays encrypted. The server only passes them along, and this device gets its key from a device you already trust."}
                </Text>
                <Field
                  label="Server address"
                  value={serverAddress}
                  onChangeText={setServerAddress}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="https://giraffle.example.com"
                />
                <Field
                  label="Connection code"
                  value={connectionCode}
                  onChangeText={setConnectionCode}
                  secureTextEntry
                  revealable
                  autoCapitalize="none"
                />
                <Field
                  label="Vault id"
                  value={vaultId}
                  onChangeText={setVaultId}
                  autoCapitalize="none"
                  placeholder="Shown under Devices on your other device"
                />
                <Field
                  label="Password for this device"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  revealable
                  autoCapitalize="none"
                  {...(error ? { error } : {})}
                />
                <Button
                  label={busy ? "Please wait…" : "Ask to join"}
                  icon="link-outline"
                  tone="accent"
                  disabled={busy || !serverAddress || !connectionCode || !vaultId || !password}
                  onPress={() => void start()}
                />
                <Button label="Back" onPress={() => router.replace("/")} />
              </>
            )}

            {error && pending ? (
              <Text style={[typography.caption, { color: colors.danger }]}>{error}</Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 380,
    padding: spacing.xl,
  },
  panel: { gap: spacing.lg },
  fingerprint: {
    padding: 16,
    borderWidth: 1,
    borderRadius: radii.sm,
    textAlign: "center",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 20,
    letterSpacing: 1,
  },
});
