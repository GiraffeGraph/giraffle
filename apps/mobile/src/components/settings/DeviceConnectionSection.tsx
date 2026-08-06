import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Field } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { typography } from "@/design/tokens";
import {
  clearSyncConfiguration,
  enrollDevice,
  loadSyncConfiguration,
  pushOutbox,
  saveSyncConfiguration,
} from "@/infrastructure/sync/syncClient";
import { useApp } from "@/state/AppProvider";

export function DeviceConnectionSection() {
  const { colors } = useTheme();
  const { session, repository, snapshot, refresh } = useApp();
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
      await enrollDevice(config, {
        vaultId: session.vaultId,
        deviceId: session.deviceId,
        repository,
      });
      const count = await pushOutbox(config, {
        vaultId: session.vaultId,
        repository,
      });
      await refresh();
      setMessage(
        count
          ? `${count} encrypted change${count === 1 ? "" : "s"} uploaded.`
          : "Everything is up to date.",
      );
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Sync failed";
      await repository.recordSyncError(reason).catch(() => undefined);
      await refresh().catch(() => undefined);
      setMessage("We couldn't upload your encrypted changes. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const removeConnection = () => {
    void clearSyncConfiguration()
      .then(() => {
        setServerAddress("");
        setConnectionCode("");
        setMessage("Connection removed. Your notes are still on this device.");
      })
      .catch(() => setMessage("The saved connection could not be removed."));
  };

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text style={[typography.title, { color: colors.text }]}>Encrypted sync</Text>
        <Text style={[typography.body, { color: colors.secondary }]}>
          {"Upload this device's encrypted change queue to your Giraffle server."}
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
          label={`Update${snapshot.sync.pending ? ` (${snapshot.sync.pending})` : ""}`}
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
