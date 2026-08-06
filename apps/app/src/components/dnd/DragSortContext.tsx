import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
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
  /** Rows that only accept "inside", e.g. a kanban column. */
  containerOnly: boolean;
}

interface DragSortValue {
  draggingId: string | null;
  target: DropTarget | null;
  register(slot: Slot): void;
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
  const blocked = useRef<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const targetRef = useRef<DropTarget | null>(null);

  const register = useCallback((slot: Slot) => {
    slots.current.set(slot.id, slot);
  }, []);

  const unregister = useCallback((id: string) => {
    slots.current.delete(id);
  }, []);

  const begin = useCallback((id: string, blockedIds: readonly string[]) => {
    blocked.current = new Set([id, ...blockedIds]);
    targetRef.current = null;
    setTarget(null);
    setDraggingId(id);
  }, []);

  const update = useCallback((absoluteX: number, absoluteY: number) => {
    let next: DropTarget | null = null;

    for (const slot of slots.current.values()) {
      if (blocked.current.has(slot.id)) continue;
      if (absoluteY < slot.top || absoluteY > slot.top + slot.height) continue;
      // Side-by-side targets share a Y band, so both axes have to match.
      if (absoluteX < slot.left || absoluteX > slot.left + slot.width) continue;

      const offset = (absoluteY - slot.top) / slot.height;
      const zone: DropZone = slot.containerOnly
        ? "inside"
        : offset < EDGE_RATIO
          ? "before"
          : offset > 1 - EDGE_RATIO
            ? "after"
            : "inside";
      next = { id: slot.id, zone };
      break;
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
    () => ({ draggingId, target, register, unregister, begin, update, end, cancel }),
    [begin, cancel, draggingId, end, register, target, unregister, update],
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
  const drag = useDragSort();
  const viewRef = useRef<View>(null);

  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      viewRef.current?.measureInWindow((x, y, width) => {
        drag.register({ id, top: y, height, left: x, width, blocked: false, containerOnly });
      });
    },
    [containerOnly, drag, id],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .enabled(!disabled)
        .onStart(() => {
          drag.begin(id, blockedIds);
        })
        .onUpdate((event) => {
          drag.update(event.absoluteX, event.absoluteY);
        })
        .onEnd(() => {
          const target = drag.end();
          if (target) onDrop(id, target);
        })
        .onFinalize(() => {
          drag.cancel();
        })
        .runOnJS(true),
    [blockedIds, disabled, drag, id, onDrop],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View ref={viewRef} collapsable={false} onLayout={measure} style={style}>
        {children}
      </View>
    </GestureDetector>
  );
}
