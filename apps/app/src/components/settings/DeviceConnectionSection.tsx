import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Field } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { typography } from "@/design/tokens";
import {
  clearSyncConfiguration,
  loadSyncConfiguration,
  saveSyncConfiguration,
} from "@/infrastructure/sync/syncClient";
import { useApp } from "@/state/AppProvider";

export function DeviceConnectionSection() {
  const { colors } = useTheme();
  const { session, repository, snapshot, syncNow } = useApp();
  const [serverAddress, setServerAddress] = useState("");
  const [connectionCode, setConnectionCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadSyncConfiguration()
      .then((value) => {
        if (value) {
          setServerAddress(value.baseUrl);
          setConnectionCode(value.token);
        }
      })
      .catch(() => setMessage("The saved connection could not be read."));
  }, []);

  const save = async () => {
    let parsedAddress: URL;
    try {
      parsedAddress = new URL(serverAddress);
    } catch {
      setMessage("Enter a valid server address.");
      return;
    }
    const localHttp =
      parsedAddress.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsedAddress.hostname);
    if (
      (parsedAddress.protocol !== "https:" && !localHttp) ||
      parsedAddress.username ||
      parsedAddress.password
    ) {
      setMessage("Use HTTPS. Unencrypted HTTP is allowed only for localhost.");
      return;
    }

    setBusy(true);
    try {
      await saveSyncConfiguration({
        baseUrl: serverAddress,
        token: connectionCode,
      });
      setMessage("Connection saved.");
    } catch {
      setMessage("We couldn't save this connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const updateNow = async () => {
    if (!session || !repository) return;
    setBusy(true);
    try {
      const config = await loadSyncConfiguration();
      if (!config) {
        setMessage("Save a connection first.");
        return;
      }
      const outcome = await syncNow();
      if (outcome.error) throw new Error(outcome.error);
      if (outcome.deferred) {
        throw new Error(`${outcome.deferred} encrypted changes could not be applied`);
      }
      const received = outcome.applied;
      const sent = outcome.pushed;
      setMessage(
        sent || received
          ? `Sync finished: ${sent} sent, ${received} received.`
          : "Everything is up to date.",
      );
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Sync failed";
      setMessage(`We couldn't sync: ${reason}`);
    } finally {
      setBusy(false);
    }
  };

  const removeConnection = () => {
    void clearSyncConfiguration()
      .then(() => {
        setServerAddress("");
        setConnectionCode("");
        setMessage("Connection removed. Your content is still on this device.");
      })
      .catch(() => setMessage("The saved connection could not be removed."));
  };

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text style={[typography.title, { color: colors.text }]}>Encrypted sync</Text>
        <Text style={[typography.body, { color: colors.secondary }]}>
          {"Changes sync automatically while Giraffle is open."}
        </Text>
      </View>
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
      <View style={styles.actions}>
        <Button
          label="Save"
          tone="accent"
          disabled={busy || !serverAddress || !connectionCode}
          onPress={() => void save()}
        />
        <Button
          label={`Sync now${snapshot.sync.pending ? ` (${snapshot.sync.pending})` : ""}`}
          icon="sync-outline"
          disabled={busy}
          onPress={() => void updateNow()}
        />
      </View>
      {serverAddress ? (
        <Button
          label="Remove connection"
          tone="danger"
          onPress={removeConnection}
        />
      ) : null}
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[typography.body, { color: colors.secondary }]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  intro: { gap: 4 },
  actions: { flexDirection: "row", gap: 8 },
});
