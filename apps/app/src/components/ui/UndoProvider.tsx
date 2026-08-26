import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";

const UNDO_WINDOW_MS = 6_000;

interface UndoRequest {
  label: string;
  action(): Promise<unknown>;
  undo(): Promise<unknown>;
}

type Commit = (request: UndoRequest) => Promise<void>;

const Context = createContext<Commit | null>(null);

export function UndoProvider({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<Pick<UndoRequest, "label" | "undo"> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
  }, []);

  useEffect(() => clear, [clear]);

  const commit = useCallback<Commit>(
    async (request) => {
      try {
        await request.action();
      } catch {
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      setPending({ label: request.label, undo: request.undo });
      timer.current = setTimeout(clear, UNDO_WINDOW_MS);
    },
    [clear],
  );

  const undoNow = () => {
    const action = pending?.undo;
    clear();
    if (action) void action().catch(() => undefined);
  };

  return (
    <Context.Provider value={commit}>
      {children}
      {pending ? (
        <View
          pointerEvents="box-none"
          style={[styles.layer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        >
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.bar,
              { backgroundColor: colors.surfaceStrong, borderColor: colors.borderStrong },
            ]}
          >
            <Text numberOfLines={1} style={[typography.body, { color: colors.text, flex: 1 }]}>
              {pending.label}
            </Text>
            <Button label="Undo" onPress={undoNow} />
          </View>
        </View>
      ) : null}
    </Context.Provider>
  );
}

export function useUndo(): Commit {
  const commit = useContext(Context);
  if (!commit) throw new Error("useUndo requires UndoProvider");
  return commit;
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  bar: {
    width: "100%",
    maxWidth: 420,
    minHeight: 44,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
