import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon, type IconName } from "@/components/ui/primitives";
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

const STATUS_ICON: Record<string, IconName> = {
  pending: "time-outline",
  active: "checkmark-circle-outline",
  revoked: "close-circle-outline",
};

export default function Devices() {
  const { colors } = useTheme();
  const { session, repository, snapshot, syncNow } = useApp();
  const [devices, setDevices] = useState<LinkableDevice[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<LinkableDevice | null>(null);

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
    setMessage(null);
    setApprovalTarget(target);
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
                if (outcome.deferred) {
                  throw new Error(`${outcome.deferred} encrypted changes could not be applied`);
                }
              })
            }
          />
        }
      />
      <Page>
        <View>
          <Text style={[typography.label, styles.sectionLabel, { color: colors.faint }]}>
            This device
          </Text>
          <DividerRow>
            <Icon name="finger-print-outline" size={16} color={colors.faint} />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>Fingerprint</Text>
            <Text selectable style={[typography.body, { color: colors.muted }]}>
              {thisDevice?.fingerprint ?? "Not connected yet"}
            </Text>
          </DividerRow>
          <DividerRow>
            <Icon name="cube-outline" size={16} color={colors.faint} />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>Vault id</Text>
            <Text selectable numberOfLines={1} style={[typography.body, { color: colors.muted }]}>
              {session?.vaultId ?? ""}
            </Text>
          </DividerRow>
          <Text style={[typography.caption, styles.hint, { color: colors.muted }]}>
            Read the fingerprint aloud when connecting another device.
          </Text>
        </View>

        <View>
          <Text style={[typography.label, styles.sectionLabel, { color: colors.faint }]}>
            All devices
          </Text>
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
                  name={STATUS_ICON[device.status] ?? "ellipse-outline"}
                  size={16}
                  color={device.status === "active" ? colors.accent : colors.faint}
                />
                <Text numberOfLines={1} style={[typography.body, { color: colors.text, flex: 1 }]}>
                  {device.name}
                </Text>
                <Text selectable style={[typography.caption, { color: colors.muted }]}>
                  {`${STATUS_COPY[device.status] ?? device.status} · ${device.fingerprint}`}
                </Text>
                {device.status === "pending" ? (
                  <Button
                    label="Approve"
                    accessibilityLabel={`Approve ${device.name}`}
                    disabled={busy}
                    onPress={() => approve(device)}
                  />
                ) : device.status === "active" && !device.isThisDevice ? (
                  <Button
                    label="Remove"
                    tone="danger"
                    accessibilityLabel={`Remove ${device.name}`}
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
          {approvalTarget ? (
            <View style={styles.approval}>
              <Text style={[typography.title, { color: colors.text }]}>Approve this device?</Text>
              <Text style={[typography.body, { color: colors.secondary }]}>Only continue if the other device shows exactly this number:</Text>
              <Text selectable style={[styles.fingerprint, typography.title, { color: colors.text }]}>
                {approvalTarget.fingerprint}
              </Text>
              <Text style={[typography.caption, { color: colors.muted }]}>If the numbers differ, cancel. Someone else may be trying to join.</Text>
              <View style={styles.actions}>
                <Button label="Cancel" disabled={busy} onPress={() => setApprovalTarget(null)} />
                <Button
                  label="Numbers match — approve"
                  tone="accent"
                  disabled={busy}
                  onPress={() =>
                    session && repository
                      ? void act("Device approved.", async () => {
                          const config = await loadSyncConfiguration();
                          if (!config) throw new Error("Save a connection first");
                          await approveDevice(config, {
                            vaultId: session.vaultId,
                            repository,
                            target: approvalTarget,
                          });
                          setApprovalTarget(null);
                        })
                      : undefined
                  }
                />
              </View>
            </View>
          ) : null}
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
  sectionLabel: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  hint: { marginTop: spacing.sm },
  approval: { marginTop: spacing.lg, gap: spacing.sm },
  fingerprint: { letterSpacing: 1 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, flexWrap: "wrap" },
});
