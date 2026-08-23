import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { layout, radii, spacing, typography } from "@/design/tokens";

export interface ConfirmRequest {
  title: string;
  body?: string;
  /** The word on the button that goes through with it. */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger";
  /** A message with nothing to decide shows one button and resolves true. */
  acknowledge?: boolean;
}

type Ask = (request: ConfirmRequest) => Promise<boolean>;

const Context = createContext<Ask | null>(null);

/**
 * React Native's `Alert` does nothing at all on the web, and the app ships a
 * web build both to the browser and inside the desktop shell. A confirmation
 * there has to be the app's own to be asked at all, so this one is, and it
 * behaves the same on every platform.
 */
export function ConfirmProvider({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const settle = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((value: boolean) => {
    setRequest(null);
    settle.current?.(value);
    settle.current = null;
  }, []);

  const ask = useCallback<Ask>((next) => {
    // A second question while one is open answers the first with a no, which is
    // the safe reading of "the person never saw it".
    settle.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
    });
  }, []);

  const value = useMemo(() => ask, [ask]);

  return (
    <Context.Provider value={value}>
      {children}
      <Modal
        visible={request !== null}
        transparent
        animationType="fade"
        onRequestClose={() => close(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => close(false)}
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
        />
        <View pointerEvents="box-none" style={styles.centre}>
          <View
            accessibilityViewIsModal
            style={[
              styles.dialog,
              { backgroundColor: colors.surfaceStrong, borderColor: colors.border },
            ]}
          >
            <Text accessibilityRole="header" style={[typography.title, { color: colors.text }]}>
              {request?.title}
            </Text>
            {request?.body ? (
              <Text style={[typography.body, { color: colors.secondary }]}>{request.body}</Text>
            ) : null}
            <View style={styles.actions}>
              {request?.acknowledge ? null : (
                <Button label={request?.cancelLabel ?? "Cancel"} onPress={() => close(false)} />
              )}
              <Button
                label={request?.confirmLabel ?? (request?.acknowledge ? "OK" : "Confirm")}
                tone={request?.tone === "danger" ? "danger" : "accent"}
                onPress={() => close(true)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Context.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(Context);
  if (!ask) throw new Error("useConfirm requires ConfirmProvider");
  return ask;
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", inset: 0 },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sheet,
    gap: spacing.sm,
  },
  actions: {
    marginTop: spacing.sm,
    minHeight: layout.rowHeight,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
