"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isDragData, type CalendarTodo } from "./stride.types";
import { isRecord } from "@/lib/utils";
import { StrideDurationPicker } from "./StrideDurationPicker";

export const HOUR_PX = 60; // 1 px = 1 minute
const SNAP = 15;           // snap grid in minutes
const MIN_DURATION = 15;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Infinite-mode constants
const INF_DAY_W = 180;
const INF_GUTTER_W = 52;
const INF_HEADER_H = 64;
const INF_INITIAL_DAYS = 28;
const INF_INITIAL_OFFSET = -14; // days before anchor week start
const INF_PAGE = 14;
const INF_EDGE = 600; // px from edge to trigger load

// ─── Helpers ─────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function snap(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP;
}
function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}
function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const hh = h % 12 || 12;
  return `${hh}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${h}h`;
}

const QUADRANT_COLORS: Record<string, string> = {
  DO: "var(--md-sys-color-error)",
  SCHEDULE: "var(--md-sys-color-success)",
  DELEGATE: "var(--md-sys-color-warning)",
  ELIMINATE: "var(--md-sys-color-outline)",
};

// ─── Drag state shared across the week view ───────────────────

interface DragOverlay {
  todoId: string;
  dayIso: string;       // startOfDay ISO
  startMinute: number;  // snapped minutes from midnight
  duration: number;
  accentColor: string;
}

// ─── New-todo inline creator ──────────────────────────────────

interface NewTodoInputProps {
  minute: number;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

function NewTodoInput({ minute, onConfirm, onCancel }: NewTodoInputProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  // Focus after mount, but delay slightly so the mouseup that ended
  // the hold doesn't steal focus away before we get it
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  // Dismiss on outside mousedown (same pattern as StrideDurationPicker)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  const commit = () => onConfirm(text.trim() || "New task");

  return (
    <div
      ref={wrapRef}
      className="stride-new-todo-input"
      style={{ top: minute, height: HOUR_PX }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        className="stride-new-todo-text"
        placeholder="New task…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
      />
    </div>
  );
}

// ─── Event block ──────────────────────────────────────────────

interface EventBlockProps {
  todo: CalendarTodo;
  isDraggedOver: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onDurationChange: (id: string, minutes: number) => void;
  onUpdateText?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
}

function EventBlock({ todo, isDraggedOver, onToggle, onDurationChange, onUpdateText, onDelete }: EventBlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [resizeDraft, setResizeDraft] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(todo.text);
  const isResizingRef = useRef(false);
  const startYRef = useRef(0);
  const startDurationRef = useRef(todo.durationMinutes);

  const top = useMemo(() => {
    const d = new Date(todo.dueDate!);
    return d.getHours() * HOUR_PX + d.getMinutes();
  }, [todo.dueDate]);

  const duration = resizeDraft ?? todo.durationMinutes;
  const height = Math.max(duration, MIN_DURATION);
  const accentColor = todo.quadrant
    ? QUADRANT_COLORS[todo.quadrant]
    : "var(--md-sys-color-primary)";

  const timeStr = useMemo(() => {
    const d = new Date(todo.dueDate!);
    const endD = new Date(d.getTime() + duration * 60000);
    const fmt = (x: Date) =>
      x.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${fmt(d)} – ${fmt(endD)}`;
  }, [todo.dueDate, duration]);

  // Focus title input when editing starts
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  // ── Draggable ──
  useEffect(() => {
    const el = blockRef.current;
    if (!el) return;
    return draggable({
      element: el,
      canDrag: () => !isResizingRef.current,
      getInitialData: () => ({ type: "stride:todo", todoId: todo.id }),
    });
  }, [todo.id]);

  // ── Resize handle ──
  useEffect(() => {
    const handle = resizeRef.current;
    if (!handle) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientY - startYRef.current;
      const raw = startDurationRef.current + delta;
      const snapped = Math.max(MIN_DURATION, snap(raw));
      setResizeDraft(snapped);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      setResizeDraft((d) => {
        if (d !== null) onDurationChange(todo.id, d);
        return null;
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingRef.current = true;
      startYRef.current = e.clientY;
      startDurationRef.current = todo.durationMinutes;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
    return () => {
      handle.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id, todo.durationMinutes]);

  const compact = height < 36;

  return (
    <div
      ref={blockRef}
      className={[
        "stride-event-block",
        todo.checked ? "stride-event-block--checked" : "",
        compact ? "stride-event-block--compact" : "",
        isDraggedOver ? "stride-event-block--dragging" : "",
        resizeDraft !== null ? "stride-event-block--resizing" : "",
      ].filter(Boolean).join(" ")}
      style={{ top, height, "--stride-event-accent": accentColor } as React.CSSProperties}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="stride-event-check"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggle(todo.id, !todo.checked); }}
      >
        {todo.checked
          ? <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check_circle</span>
          : <span className="stride-event-check-ring" />}
      </button>

      <div className="stride-event-body">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="stride-event-title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onUpdateText?.(todo.id, titleDraft);
                setEditingTitle(false);
              }
              if (e.key === "Escape") {
                setTitleDraft(todo.text);
                setEditingTitle(false);
              }
            }}
            onBlur={() => {
              onUpdateText?.(todo.id, titleDraft);
              setEditingTitle(false);
            }}
          />
        ) : (
          <span
            className="stride-event-title"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setTitleDraft(todo.text);
              setEditingTitle(true);
            }}
          >
            {todo.text || "Untitled task"}
          </span>
        )}
        {!compact && <span className="stride-event-time">{timeStr}</span>}
        {!compact && (
          <span className="stride-event-note">
            {todo.note.icon ? `${todo.note.icon} ` : ""}{todo.note.title}
          </span>
        )}
      </div>

      {onDelete && (
        <button
          type="button"
          className="stride-event-delete-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(todo.id); }}
          title="Delete task"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
        </button>
      )}

      {!compact && (
        <div className="stride-event-duration-wrap">
          <button
            type="button"
            className="stride-event-duration-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v); }}
          >
            {resizeDraft !== null ? formatDuration(resizeDraft) : formatDuration(todo.durationMinutes)}
          </button>
          {showPicker && (
            <StrideDurationPicker
              value={todo.durationMinutes}
              onChange={(m) => { onDurationChange(todo.id, m); setShowPicker(false); }}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      )}

      {/* Resize label during drag */}
      {resizeDraft !== null && (
        <div className="stride-resize-label">
          {timeStr}
        </div>
      )}

      <div ref={resizeRef} className="stride-event-resize-handle" />
    </div>
  );
}

// ─── Drop ghost (drag preview in the column) ──────────────────

interface DropGhostProps {
  startMinute: number;
  duration: number;
  accentColor: string;
  label: string;
}

function DropGhost({ startMinute, duration, accentColor, label }: DropGhostProps) {
  const top = startMinute;
  const height = Math.max(duration, MIN_DURATION);

  return (
    <div
      className="stride-drop-ghost"
      style={{ top, height, "--stride-event-accent": accentColor } as React.CSSProperties}
    >
      <span className="stride-drop-ghost-label">{label}</span>
    </div>
  );
}

// ─── Day column ───────────────────────────────────────────────

interface DayColumnProps {
  date: Date;
  todos: CalendarTodo[];
  dragOverlay: DragOverlay | null;
  activeTodoId: string | null;
  onToggle: (id: string, checked: boolean) => void;
  onDurationChange: (id: string, minutes: number) => void;
  onCreateTodo?: (text: string, dueDate: Date, durationMinutes: number) => void;
  onUpdateText?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
}

function DayColumn({
  date,
  todos,
  dragOverlay,
  activeTodoId,
  onToggle,
  onDurationChange,
  onCreateTodo,
  onUpdateText,
  onDelete,
}: DayColumnProps) {
  const colRef = useRef<HTMLDivElement>(null);
  const dayIso = startOfDay(date).toISOString();
  const isHovered = dragOverlay?.dayIso === dayIso;
  const [createMinute, setCreateMinute] = useState<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartYRef = useRef(0);

  useEffect(() => {
    const el = colRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: ({ input }) => {
        const rect = el.getBoundingClientRect();
        const relY = Math.max(0, input.clientY - rect.top);
        const raw = Math.floor(relY);
        const snapped = Math.min(snap(raw), 23 * 60 + 45); // cap at 23:45
        return {
          type: "stride:slot",
          date: dayIso,
          hour: Math.floor(snapped / 60),
          minute: snapped % 60,
        };
      },
    });
  }, [dayIso]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = colRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relY = Math.max(0, e.clientY - rect.top);
    const snapped = Math.min(snap(Math.floor(relY)), 23 * 60 + 45);
    holdStartYRef.current = e.clientY;
    document.body.style.userSelect = "none";

    holdTimerRef.current = setTimeout(() => {
      document.body.style.userSelect = "";
      setCreateMinute(snapped);
    }, 300);
  }, []);

  const handleMouseMoveCancel = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (holdTimerRef.current && Math.abs(e.clientY - holdStartYRef.current) > 6) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const handleMouseUpCancel = useCallback(() => {
    document.body.style.userSelect = "";
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  const handleConfirm = useCallback((text: string) => {
    if (createMinute === null) return;
    const dueDate = new Date(date);
    dueDate.setHours(Math.floor(createMinute / 60), createMinute % 60, 0, 0);
    onCreateTodo?.(text, dueDate, 60);
    setCreateMinute(null);
  }, [createMinute, date, onCreateTodo]);

  return (
    <div
      ref={colRef}
      className={[
        "stride-day-column",
        isHovered ? "stride-day-column--hovered" : "",
      ].filter(Boolean).join(" ")}
      style={{ height: HOUR_PX * 24 }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMoveCancel}
      onMouseUp={handleMouseUpCancel}
    >
      {todos.map((t) => (
        <EventBlock
          key={t.id}
          todo={t}
          isDraggedOver={t.id === activeTodoId}
          onToggle={onToggle}
          onDurationChange={onDurationChange}
          onUpdateText={onUpdateText}
          onDelete={onDelete}
        />
      ))}

      {/* Drop ghost — shown when dragging over this column */}
      {isHovered && dragOverlay && (
        <DropGhost
          startMinute={dragOverlay.startMinute}
          duration={dragOverlay.duration}
          accentColor={dragOverlay.accentColor}
          label={formatMinutes(dragOverlay.startMinute)}
        />
      )}

      {/* Inline creation input — shown after long-press */}
      {createMinute !== null && (
        <NewTodoInput
          minute={createMinute}
          onConfirm={handleConfirm}
          onCancel={() => setCreateMinute(null)}
        />
      )}
    </div>
  );
}

// ─── Current-time indicator ───────────────────────────────────

function NowLine() {
  const [top, setTop] = useState(() => {
    const now = new Date();
    return now.getHours() * HOUR_PX + now.getMinutes();
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTop(now.getHours() * HOUR_PX + now.getMinutes());
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="stride-now-line" style={{ top }}>
      <span className="stride-now-dot" />
    </div>
  );
}

// ─── All-day row ──────────────────────────────────────────────

function AllDaySlot({ date }: { date: Date }) {
  const ref = useRef<HTMLDivElement>(null);
  const dayIso = startOfDay(date).toISOString();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: () => ({ type: "stride:slot", date: dayIso, hour: 8, minute: 0 }),
    });
  }, [dayIso]);
  return <div ref={ref} className="stride-allday-slot" />;
}

// ─── Auto-scroll helper ───────────────────────────────────────

function useAutoScroll(scrollRef: React.RefObject<HTMLDivElement | null>, isDragging: boolean) {
  const rafRef = useRef<number | null>(null);
  const posRef = useRef({ y: 0 });

  useEffect(() => {
    if (!isDragging) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const onMouseMove = (e: MouseEvent) => { posRef.current.y = e.clientY; };
    document.addEventListener("mousemove", onMouseMove);

    const EDGE = 80;    // px from edge to start scrolling
    const SPEED = 12;   // px per frame

    const tick = () => {
      const el = scrollRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const { y } = posRef.current;
        if (y < rect.top + EDGE) {
          el.scrollTop -= SPEED * ((rect.top + EDGE - y) / EDGE);
        } else if (y > rect.bottom - EDGE) {
          el.scrollTop += SPEED * ((y - (rect.bottom - EDGE)) / EDGE);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isDragging, scrollRef]);
}

// ─── Week view root ───────────────────────────────────────────

interface StrideWeekViewProps {
  anchor: Date;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
  onDurationChange?: (id: string, minutes: number) => void;
  onCreateTodo?: (text: string, dueDate: Date, durationMinutes: number) => void;
  onUpdateText?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  customDays?: number;
}

export function StrideWeekView(props: StrideWeekViewProps) {
  if (props.customDays == null) return <InfiniteWeekView {...props} />;
  return <FixedWeekView {...props} />;
}

function FixedWeekView({
  anchor,
  todos,
  onToggle,
  onDurationChange,
  onCreateTodo,
  onUpdateText,
  onDelete,
  customDays,
}: StrideWeekViewProps) {
  const days = useMemo(() => {
    const count = customDays ?? 7;
    const base = customDays ? startOfDay(anchor) : startOfWeek(anchor);
    return Array.from({ length: count }, (_, i) => addDays(base, i));
  }, [anchor, customDays]);

  const today = startOfDay(new Date());
  const todayIso = today.toISOString();

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTodo[]>();
    for (const t of todos) {
      if (!t.dueDate) continue;
      const key = startOfDay(new Date(t.dueDate)).toISOString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [todos]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = HOUR_PX * 7;
  }, []);

  // ── Drag overlay state ──
  const [dragOverlay, setDragOverlay] = useState<DragOverlay | null>(null);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);

  useAutoScroll(scrollRef, activeTodoId !== null);

  const todosById = useMemo(() => {
    const m = new Map<string, CalendarTodo>();
    for (const t of todos) m.set(t.id, t);
    return m;
  }, [todos]);

  useEffect(() => {
    return monitorForElements({
      onDragStart({ source }) {
        if (isDragData(source.data)) {
          setActiveTodoId(source.data.todoId);
        }
      },
      onDrag({ source, location }) {
        if (!isDragData(source.data)) return;
        const { todoId } = source.data;

        const col = location.current.dropTargets[0];
        if (!col) { setDragOverlay(null); return; }
        if (!isRecord(col.data)) { setDragOverlay(null); return; }
        const colData = col.data;
        if (colData.type !== "stride:slot") { setDragOverlay(null); return; }

        const hour = colData.hour as number;
        const minute = (colData.minute as number) ?? 0;
        const startMinute = hour * 60 + minute;

        const todo = todosById.get(todoId);
        const duration = todo?.durationMinutes ?? 60;
        const accentColor = todo?.quadrant
          ? QUADRANT_COLORS[todo.quadrant]
          : "var(--md-sys-color-primary)";

        setDragOverlay({
          todoId,
          dayIso: colData.date as string,
          startMinute,
          duration,
          accentColor,
        });
      },
      onDrop() {
        setDragOverlay(null);
        setActiveTodoId(null);
      },
      onDropTargetChange({ location }) {
        if (location.current.dropTargets.length === 0) {
          setDragOverlay(null);
        }
      },
    });
  }, [todosById]);

  const handleDuration = onDurationChange ?? (() => {});
  const colCount = days.length;

  return (
    <div
      className="stride-week-view"
      style={{ "--stride-col-count": colCount } as React.CSSProperties}
    >
      {/* Column headers */}
      <div className="stride-week-header-row">
        <div className="stride-time-gutter" />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`stride-day-header${isToday ? " stride-day-header--today" : ""}`}
            >
              <span className="stride-day-header-label">{DAY_LABELS[d.getDay()]}</span>
              <span className={`stride-day-header-num${isToday ? " stride-day-header-num--today" : ""}`}>
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div className="stride-allday-row">
        <div className="stride-time-gutter stride-time-gutter--allday"><span>All day</span></div>
        {days.map((d) => <AllDaySlot key={d.toISOString()} date={d} />)}
      </div>

      {/* Scrollable time grid */}
      <div className="stride-time-grid-scroll" ref={scrollRef}>
        <div className="stride-time-grid" style={{ height: HOUR_PX * 24 }}>

          {/* Gutter */}
          <div className="stride-gutter-col">
            {HOURS.map((h) => (
              <div key={h} className="stride-gutter-hour" style={{ top: h * HOUR_PX, height: HOUR_PX }}>
                <span>{formatHour(h)}</span>
              </div>
            ))}
          </div>

          {/* Grid lines */}
          <div className="stride-grid-lines">
            {HOURS.map((h) => (
              <div key={h} className="stride-grid-line" style={{ top: h * HOUR_PX }} />
            ))}
            {HOURS.map((h) => (
              <div key={`${h}h`} className="stride-grid-line stride-grid-line--half" style={{ top: h * HOUR_PX + 30 }} />
            ))}
          </div>

          {/* Day columns */}
          <div className="stride-day-columns">
            {days.map((d) => {
              const key = startOfDay(d).toISOString();
              const isToday = key === todayIso;
              return (
                <div key={key} style={{ position: "relative" }}>
                  {isToday && <NowLine />}
                  <DayColumn
                    date={d}
                    todos={byDay.get(key) ?? []}
                    dragOverlay={dragOverlay}
                    activeTodoId={activeTodoId}
                    onToggle={onToggle}
                    onDurationChange={handleDuration}
                    onCreateTodo={onCreateTodo}
                    onUpdateText={onUpdateText}
                    onDelete={onDelete}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Infinite horizontal scroll mode ──────────────────────────

function InfiniteWeekView({
  anchor,
  todos,
  onToggle,
  onDurationChange,
  onCreateTodo,
  onUpdateText,
  onDelete,
}: StrideWeekViewProps) {
  const today = startOfDay(new Date());
  const todayIso = today.toISOString();

  const [{ start, count }, setRange] = useState(() => ({
    start: addDays(startOfWeek(anchor), INF_INITIAL_OFFSET),
    count: INF_INITIAL_DAYS,
  }));

  const days = useMemo(
    () => Array.from({ length: count }, (_, i) => addDays(start, i)),
    [start, count],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTodo[]>();
    for (const t of todos) {
      if (!t.dueDate) continue;
      const key = startOfDay(new Date(t.dueDate)).toISOString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [todos]);

  const todosById = useMemo(() => {
    const m = new Map<string, CalendarTodo>();
    for (const t of todos) m.set(t.id, t);
    return m;
  }, [todos]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingLeftAdjust = useRef(0);
  const loadingRef = useRef(false);
  const didInitialScroll = useRef(false);

  // Initial scroll: center today, vertical to 7am
  useLayoutEffect(() => {
    if (didInitialScroll.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const todayIdx = Math.floor(
      (today.getTime() - start.getTime()) / 86_400_000,
    );
    el.scrollLeft =
      INF_GUTTER_W + todayIdx * INF_DAY_W - el.clientWidth / 2 + INF_DAY_W / 2;
    el.scrollTop = HOUR_PX * 7;
    didInitialScroll.current = true;
  }, [start, today]);

  // Apply pending scrollLeft adjustment after prepend (avoid jump)
  useLayoutEffect(() => {
    if (pendingLeftAdjust.current && scrollRef.current) {
      scrollRef.current.scrollLeft += pendingLeftAdjust.current;
      pendingLeftAdjust.current = 0;
    }
    loadingRef.current = false;
  }, [start, count]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingRef.current) return;
    const el = e.currentTarget;
    if (el.scrollLeft < INF_EDGE) {
      loadingRef.current = true;
      pendingLeftAdjust.current = INF_PAGE * INF_DAY_W;
      setRange((r) => ({
        start: addDays(r.start, -INF_PAGE),
        count: r.count + INF_PAGE,
      }));
    } else if (el.scrollLeft + el.clientWidth > el.scrollWidth - INF_EDGE) {
      loadingRef.current = true;
      setRange((r) => ({ ...r, count: r.count + INF_PAGE }));
    }
  }, []);

  const [dragOverlay, setDragOverlay] = useState<DragOverlay | null>(null);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  useAutoScroll(scrollRef, activeTodoId !== null);

  useEffect(() => {
    return monitorForElements({
      onDragStart({ source }) {
        if (isDragData(source.data)) {
          setActiveTodoId(source.data.todoId);
        }
      },
      onDrag({ source, location }) {
        if (!isDragData(source.data)) return;
        const { todoId } = source.data;
        const col = location.current.dropTargets[0];
        if (!col) { setDragOverlay(null); return; }
        if (!isRecord(col.data)) { setDragOverlay(null); return; }
        const colData = col.data;
        if (colData.type !== "stride:slot") { setDragOverlay(null); return; }
        const hour = colData.hour as number;
        const minute = (colData.minute as number) ?? 0;
        const todo = todosById.get(todoId);
        const duration = todo?.durationMinutes ?? 60;
        const accentColor = todo?.quadrant
          ? QUADRANT_COLORS[todo.quadrant]
          : "var(--md-sys-color-primary)";
        setDragOverlay({
          todoId,
          dayIso: colData.date as string,
          startMinute: hour * 60 + minute,
          duration,
          accentColor,
        });
      },
      onDrop() {
        setDragOverlay(null);
        setActiveTodoId(null);
      },
      onDropTargetChange({ location }) {
        if (location.current.dropTargets.length === 0) setDragOverlay(null);
      },
    });
  }, [todosById]);

  const handleDuration = onDurationChange ?? (() => {});
  const canvasWidth = INF_GUTTER_W + count * INF_DAY_W;

  return (
    <div className="stride-week-view stride-inf">
      <div
        ref={scrollRef}
        className="stride-inf-scroll"
        onScroll={onScroll}
        style={{
          ["--stride-day-w" as string]: `${INF_DAY_W}px`,
          ["--stride-gutter-w" as string]: `${INF_GUTTER_W}px`,
          ["--stride-day-count" as string]: count,
        } as React.CSSProperties}
      >
        <div className="stride-inf-canvas" style={{ width: canvasWidth }}>
          {/* Header row (sticky top) */}
          <div className="stride-inf-row stride-inf-header-row">
            <div className="stride-inf-gutter-cell stride-inf-corner" />
            {days.map((d) => {
              const isToday = isSameDay(d, today);
              return (
                <div
                  key={d.toISOString()}
                  className={`stride-day-header${isToday ? " stride-day-header--today" : ""}`}
                >
                  <span className="stride-day-header-label">{DAY_LABELS[d.getDay()]}</span>
                  <span className={`stride-day-header-num${isToday ? " stride-day-header-num--today" : ""}`}>
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* All-day row (sticky top) */}
          <div className="stride-inf-row stride-inf-allday-row">
            <div className="stride-inf-gutter-cell stride-inf-allday-label">
              <span>All day</span>
            </div>
            {days.map((d) => <AllDaySlot key={d.toISOString()} date={d} />)}
          </div>

          {/* Time body */}
          <div className="stride-inf-time" style={{ height: HOUR_PX * 24 }}>
            <div className="stride-inf-time-gutter">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="stride-gutter-hour"
                  style={{ top: h * HOUR_PX, height: HOUR_PX }}
                >
                  <span>{formatHour(h)}</span>
                </div>
              ))}
            </div>
            <div className="stride-inf-grid-lines">
              {HOURS.map((h) => (
                <div key={h} className="stride-grid-line" style={{ top: h * HOUR_PX }} />
              ))}
              {HOURS.map((h) => (
                <div key={`${h}h`} className="stride-grid-line stride-grid-line--half" style={{ top: h * HOUR_PX + 30 }} />
              ))}
            </div>
            <div className="stride-inf-day-cols">
              {days.map((d) => {
                const key = startOfDay(d).toISOString();
                const isToday = key === todayIso;
                return (
                  <div key={key} className="stride-inf-day-wrap">
                    {isToday && <NowLine />}
                    <DayColumn
                      date={d}
                      todos={byDay.get(key) ?? []}
                      dragOverlay={dragOverlay}
                      activeTodoId={activeTodoId}
                      onToggle={onToggle}
                      onDurationChange={handleDuration}
                      onCreateTodo={onCreateTodo}
                      onUpdateText={onUpdateText}
                      onDelete={onDelete}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
