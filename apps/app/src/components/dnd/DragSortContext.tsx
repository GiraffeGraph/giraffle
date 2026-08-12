import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  Animated,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

export type DropZone = "before" | "inside" | "after";

export interface DropTarget {
  id: string;
  zone: DropZone;
}

interface Slot {
  id: string;
  top: number;
  height: number;
  left: number;
  width: number;
  /** Rows that cannot receive a drop, e.g. a page's own subtree. */
  blocked: boolean;
  /** Rows that only accept "inside", e.g. a board column. */
  containerOnly: boolean;
}

interface DragSortValue {
  draggingId: string | null;
  target: DropTarget | null;
  register(slot: Slot): void;
  registerMeasurement(id: string, measure: () => void): void;
  unregister(id: string): void;
  begin(id: string, blockedIds: readonly string[]): void;
  update(absoluteX: number, absoluteY: number): void;
  end(): DropTarget | null;
  cancel(): void;
}

const DragSortContext = createContext<DragSortValue | null>(null);

/** Fraction of a row height that counts as its "before"/"after" edge. */
const EDGE_RATIO = 0.28;

export function DragSortProvider({ children }: PropsWithChildren) {
  const slots = useRef(new Map<string, Slot>());
  const measurements = useRef(new Map<string, () => void>());
  const blocked = useRef<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const targetRef = useRef<DropTarget | null>(null);

  const register = useCallback((slot: Slot) => {
    slots.current.set(slot.id, slot);
  }, []);

  const registerMeasurement = useCallback((id: string, measure: () => void) => {
    measurements.current.set(id, measure);
  }, []);

  const unregister = useCallback((id: string) => {
    slots.current.delete(id);
    measurements.current.delete(id);
  }, []);

  const begin = useCallback((id: string, blockedIds: readonly string[]) => {
    // Scroll views move rows without firing onLayout. Refresh every window
    // coordinate when a drag begins so targets still match what is on screen.
    for (const measure of measurements.current.values()) measure();
    blocked.current = new Set([id, ...blockedIds]);
    targetRef.current = null;
    setTarget(null);
    setDraggingId(id);
  }, []);

  const update = useCallback((absoluteX: number, absoluteY: number) => {
    let next: DropTarget | null = null;
    let nextArea = Number.POSITIVE_INFINITY;

    for (const slot of slots.current.values()) {
      if (blocked.current.has(slot.id)) continue;
      if (absoluteY < slot.top || absoluteY > slot.top + slot.height) continue;
      // Side-by-side targets share a Y band, so both axes have to match.
      if (absoluteX < slot.left || absoluteX > slot.left + slot.width) continue;

      // A lane can wrap its rows so its empty space remains droppable. When a
      // row and its lane overlap, the smaller row is the more precise target.
      const area = slot.width * slot.height;
      if (area >= nextArea) continue;

      const offset = (absoluteY - slot.top) / slot.height;
      const zone: DropZone = slot.containerOnly
        ? "inside"
        : offset < EDGE_RATIO
          ? "before"
          : offset > 1 - EDGE_RATIO
            ? "after"
            : "inside";
      next = { id: slot.id, zone };
      nextArea = area;
    }

    if (next?.id !== targetRef.current?.id || next?.zone !== targetRef.current?.zone) {
      targetRef.current = next;
      setTarget(next);
    }
  }, []);

  const end = useCallback(() => {
    const result = targetRef.current;
    targetRef.current = null;
    setTarget(null);
    setDraggingId(null);
    return result;
  }, []);

  const cancel = useCallback(() => {
    targetRef.current = null;
    setTarget(null);
    setDraggingId(null);
  }, []);

  const value = useMemo<DragSortValue>(
    () => ({
      draggingId,
      target,
      register,
      registerMeasurement,
      unregister,
      begin,
      update,
      end,
      cancel,
    }),
    [
      begin,
      cancel,
      draggingId,
      end,
      register,
      registerMeasurement,
      target,
      unregister,
      update,
    ],
  );

  return <DragSortContext.Provider value={value}>{children}</DragSortContext.Provider>;
}

export function useDragSort(): DragSortValue {
  const context = useContext(DragSortContext);

  if (!context) {
    throw new Error("useDragSort must be used inside DragSortProvider");
  }

  return context;
}

/**
 * Wraps one draggable row: long press picks it up, the pan reports the finger
 * position, and releasing hands the resolved target back to the provider.
 */
export function DragSortItem({
  id,
  blockedIds = [],
  containerOnly = false,
  disabled = false,
  onDrop,
  style,
  children,
}: PropsWithChildren<{
  id: string;
  blockedIds?: readonly string[];
  containerOnly?: boolean;
  disabled?: boolean;
  onDrop(sourceId: string, target: DropTarget): void;
  /**
   * This wrapper is the real flex child, so any sizing the parent layout
   * depends on belongs here — a percentage width on `children` would resolve
   * against an indefinite width and collapse to the content.
   */
  style?: StyleProp<ViewStyle>;
}>) {
  const {
    draggingId,
    register,
    registerMeasurement,
    unregister,
    begin,
    update,
    end,
    cancel,
  } = useDragSort();
  const viewRef = useRef<View>(null);
  const [translateX] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(1));
  const active = draggingId === id;

  const settle = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        stiffness: 260,
        damping: 24,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        stiffness: 260,
        damping: 24,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        stiffness: 260,
        damping: 24,
        mass: 0.7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, translateX, translateY]);

  const measureInWindow = useCallback(() => {
    viewRef.current?.measureInWindow((x, y, width, height) => {
      register({ id, top: y, height, left: x, width, blocked: false, containerOnly });
    });
  }, [containerOnly, id, register]);

  const measure = useCallback(
    (_event: LayoutChangeEvent) => {
      measureInWindow();
    },
    [measureInWindow],
  );

  useEffect(() => {
    registerMeasurement(id, measureInWindow);
    return () => unregister(id);
  }, [id, measureInWindow, registerMeasurement, unregister]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .enabled(!disabled)
        .onStart(() => {
          translateX.setValue(0);
          translateY.setValue(0);
          Animated.spring(scale, {
            toValue: 1.025,
            stiffness: 300,
            damping: 22,
            mass: 0.6,
            useNativeDriver: true,
          }).start();
          begin(id, blockedIds);
        })
        .onUpdate((event) => {
          translateX.setValue(event.translationX);
          translateY.setValue(event.translationY);
          update(event.absoluteX, event.absoluteY);
        })
        .onEnd(() => {
          const target = end();
          if (target) onDrop(id, target);
        })
        .onFinalize(() => {
          settle();
          cancel();
        })
        .runOnJS(true),
    [
      begin,
      blockedIds,
      cancel,
      disabled,
      end,
      id,
      onDrop,
      scale,
      settle,
      translateX,
      translateY,
      update,
    ],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        ref={viewRef}
        collapsable={false}
        onLayout={measure}
        style={[
          style,
          active ? styles.lifted : null,
          { transform: [{ translateX }, { translateY }, { scale }] },
        ]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  lifted: {
    zIndex: 2,
    elevation: 6,
    shadowColor: "#211d18",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
});
