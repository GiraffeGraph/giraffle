import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import { loadSyncConfiguration } from "@/infrastructure/sync/syncClient";
import { approveDevice, loadLinkableDevices, revokeDevice, type LinkableDevice } from "@/sync/deviceLink";
import { useApp } from "@/state/AppProvider";

const STATUS_COPY: Record<string, string> = {
  pending: "Waiting for approval",
  active: "Connected",
  revoked: "Removed",
};

export default function Devices() {
  const { colors } = useTheme();
  const { session, repository, snapshot, syncNow } = useApp();
  const [devices, setDevices] = useState<LinkableDevice[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!session) return undefined;
    let active = true;

    void (async () => {
      try {
        const config = await loadSyncConfiguration();
        if (!active) return;
        if (!config) {
          setMessage("Save a server connection in Settings first.");
          return;
        }
        const roster = await loadLinkableDevices(config, {
          vaultId: session.vaultId,
          deviceId: session.deviceId,
        });
        if (active) setDevices(roster);
      } catch {
        if (active) setMessage("The device list could not be read.");
      }
    })();

    return () => {
      active = false;
    };
  }, [session, reloads]);

  const act = useCallback(async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setReloads((value) => value + 1);
      setMessage(label);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }, []);

  const approve = (target: LinkableDevice) => {
    if (!session || !repository) return;
    Alert.alert(
      "Approve this device?",
      `Only continue if the other device shows exactly this number:\n\n${target.fingerprint}\n\nIf the numbers differ, someone else is trying to join.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Numbers match",
          onPress: () =>
            void act("Device approved.", async () => {
              const config = await loadSyncConfiguration();
              if (!config) throw new Error("Save a connection first");
              await approveDevice(config, { vaultId: session.vaultId, repository, target });
            }),
        },
      ],
    );
  };

  const thisDevice = devices.find((device) => device.isThisDevice);

  return (
    <>
      <ScreenTopbar
        title="Devices"
        action={
          <Button
            label="Sync"
            icon="sync-outline"
            disabled={busy}
            onPress={() =>
              void act("Sync finished.", async () => {
                const outcome = await syncNow();
                if (outcome.error) throw new Error(outcome.error);
              })
            }
          />
        }
      />
      <Page>
        <View style={styles.section}>
          <Text style={[typography.label, { color: colors.muted }]}>This device</Text>
          <Text selectable style={[typography.title, { color: colors.text }]}>
            {thisDevice?.fingerprint ?? "Not connected yet"}
          </Text>
          <Text style={[typography.body, { color: colors.secondary }]}>
            {"Read this number aloud when connecting another device. Your vault id is "}
            <Text selectable style={{ color: colors.text }}>{session?.vaultId ?? ""}</Text>.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[typography.label, { color: colors.muted }]}>All devices</Text>
          {devices.length === 0 ? (
            <EmptyState
              icon="phone-portrait-outline"
              title="No devices yet"
              body="Connect a server in Settings, then open Giraffle on your other device and choose to join this vault."
            />
          ) : (
            devices.map((device) => (
              <DividerRow key={device.deviceId}>
                <Icon
                  name={device.status === "active" ? "checkmark-circle-outline" : device.status === "pending" ? "time-outline" : "close-circle-outline"}
                  color={device.status === "active" ? colors.accent : colors.secondary}
                />
                <View style={styles.row}>
                  <Text style={[typography.body, { color: colors.text }]}>{device.name}</Text>
                  <Text selectable style={[typography.caption, { color: colors.muted }]}>
                    {`${STATUS_COPY[device.status] ?? device.status} · ${device.fingerprint}`}
                  </Text>
                </View>
                {device.status === "pending" ? (
                  <Button label="Approve" tone="accent" disabled={busy} onPress={() => approve(device)} />
                ) : device.status === "active" && !device.isThisDevice ? (
                  <Button
                    label="Remove"
                    tone="danger"
                    disabled={busy}
                    onPress={() =>
                      session && repository
                        ? void act("Device removed.", async () => {
                            const config = await loadSyncConfiguration();
                            if (!config) throw new Error("Save a connection first");
                            await revokeDevice(config, { vaultId: session.vaultId, repository, target: device });
                          })
                        : undefined
                    }
                  />
                ) : null}
              </DividerRow>
            ))
          )}
        </View>

        {snapshot.sync.lastError ? (
          <Text style={[typography.caption, { color: colors.danger }]}>{snapshot.sync.lastError}</Text>
        ) : null}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.secondary }]}>
            {message}
          </Text>
        ) : null}
      </Page>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: { flex: 1, gap: 2 },
});
