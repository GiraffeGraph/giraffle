"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  createCalendarTodoAction,
  deleteCalendarTodoAction,
  getCalendarTodosAction,
  getUnscheduledTodosAction,
  setTodoDueDateAction,
  setTodoDurationAction,
  toggleCalendarTodoAction,
  updateCalendarTodoTextAction,
} from "@/server/api/notes";
import type { CalendarTodo, CalendarView } from "./stride.types";
import { StrideHeader } from "./StrideHeader";
import { StrideDayView } from "./StrideDayView";
import { StrideWeekView } from "./StrideWeekView";
import { StrideMonthView } from "./StrideMonthView";
import { StrideUnscheduled } from "./StrideUnscheduled";

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
  const day = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - day);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getWindowForView(
  view: CalendarView,
  anchor: Date,
  customDays: number
): { start: Date; end: Date } {
  switch (view) {
    case "day": {
      const s = startOfDay(anchor);
      return { start: s, end: addDays(s, 1) };
    }
    case "week": {
      const s = startOfWeek(anchor);
      return { start: s, end: addDays(s, 7) };
    }
    case "month": {
      const s = startOfMonth(anchor);
      const e = endOfMonth(anchor);
      // extend to full weeks
      const weekStart = startOfWeek(s);
      const daysNeeded = Math.ceil(
        (e.getTime() - weekStart.getTime()) / 86400000 + 1
      );
      const weekCount = Math.ceil(daysNeeded / 7);
      return { start: weekStart, end: addDays(weekStart, weekCount * 7) };
    }
    case "custom": {
      const s = startOfDay(anchor);
      return { start: s, end: addDays(s, customDays) };
    }
  }
}

function navigateAnchor(
  view: CalendarView,
  anchor: Date,
  direction: -1 | 1,
  customDays: number
): Date {
  switch (view) {
    case "day":
      return addDays(anchor, direction);
    case "week":
      return addDays(anchor, direction * 7);
    case "month": {
      const r = new Date(anchor);
      r.setMonth(r.getMonth() + direction);
      return r;
    }
    case "custom":
      return addDays(anchor, direction * customDays);
  }
}

interface StrideCalendarProps {
  initialTodos: CalendarTodo[];
  initialUnscheduled: CalendarTodo[];
}

export function StrideCalendar({
  initialTodos,
  initialUnscheduled,
}: StrideCalendarProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [customDays, setCustomDays] = useState(4);
  const [todos, setTodos] = useState<CalendarTodo[]>(initialTodos);
  const [unscheduled, setUnscheduled] =
    useState<CalendarTodo[]>(initialUnscheduled);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [isPending, startTransition] = useTransition();

  const window = useMemo(
    () => getWindowForView(view, anchor, customDays),
    [view, anchor, customDays]
  );

  // Reload todos whenever the window changes
  useEffect(() => {
    startTransition(async () => {
      const [fetched, fetchedUnscheduled] = await Promise.all([
        getCalendarTodosAction(window.start, window.end),
        getUnscheduledTodosAction(),
      ]);
      setTodos(
        fetched.map((t) => ({
          ...t,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        }))
      );
      setUnscheduled(
        fetchedUnscheduled.map((t) => ({
          ...t,
          dueDate: null,
        }))
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.start.getTime(), window.end.getTime()]);

  const handleNavigate = useCallback(
    (direction: -1 | 1) => {
      setAnchor((a) => navigateAnchor(view, a, direction, customDays));
    },
    [view, customDays]
  );

  const handleGoToday = useCallback(() => setAnchor(new Date()), []);

  // Drop handler — assign a dueDate to a todo
  const handleDrop = useCallback(
    (todoId: string, newDueDate: Date) => {
      startTransition(async () => {
        // Optimistic update
        setTodos((prev) => {
          const existing = prev.find((t) => t.id === todoId);
          if (existing) {
            return prev.map((t) =>
              t.id === todoId ? { ...t, dueDate: newDueDate } : t
            );
          }
          // From unscheduled
          const fromUnscheduled = unscheduled.find((t) => t.id === todoId);
          if (fromUnscheduled) {
            return [...prev, { ...fromUnscheduled, dueDate: newDueDate }];
          }
          return prev;
        });
        setUnscheduled((prev) => prev.filter((t) => t.id !== todoId));
        await setTodoDueDateAction(todoId, newDueDate);
      });
    },
    [unscheduled]
  );

  // Remove from calendar (drop back to unscheduled)
  const handleUnschedule = useCallback((todoId: string) => {
    startTransition(async () => {
      const todo = todos.find((t) => t.id === todoId);
      if (todo) {
        setTodos((prev) => prev.filter((t) => t.id !== todoId));
        setUnscheduled((prev) => [...prev, { ...todo, dueDate: null }]);
      }
      await setTodoDueDateAction(todoId, null);
    });
  }, [todos]);

  // Toggle checked
  const handleToggle = useCallback((todoId: string, checked: boolean) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, checked } : t))
    );
    setUnscheduled((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, checked } : t))
    );
    startTransition(() => toggleCalendarTodoAction(todoId, checked));
  }, []);

  // Update todo text — optimistic + persist
  const handleUpdateText = useCallback((todoId: string, text: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, text } : t))
    );
    setUnscheduled((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, text } : t))
    );
    startTransition(() => updateCalendarTodoTextAction(todoId, text));
  }, []);

  // Delete todo — optimistic remove + persist
  const handleDeleteTodo = useCallback((todoId: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
    setUnscheduled((prev) => prev.filter((t) => t.id !== todoId));
    startTransition(() => deleteCalendarTodoAction(todoId));
  }, []);

  // Create a new todo directly on the calendar (long-press on empty slot)
  const handleCreateTodo = useCallback(
    (text: string, dueDate: Date, durationMinutes: number) => {
      startTransition(async () => {
        const newTodo = await createCalendarTodoAction(text, dueDate, durationMinutes);
        setTodos((prev) => [
          ...prev,
          { ...newTodo, dueDate: new Date(newTodo.dueDate!) },
        ]);
      });
    },
    []
  );

  // Duration change — optimistic + persist
  const handleDurationChange = useCallback(
    (todoId: string, minutes: number) => {
      setTodos((prev) =>
        prev.map((t) =>
          t.id === todoId ? { ...t, durationMinutes: minutes } : t
        )
      );
      startTransition(() => setTodoDurationAction(todoId, minutes));
    },
    []
  );

  // Global DnD monitor
  const monitorCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    monitorCleanupRef.current?.();
    monitorCleanupRef.current = monitorForElements({
      onDrop({ source, location }) {
        const dropTarget = location.current.dropTargets[0];
        if (!dropTarget) return;
        const srcData = source.data as Record<string, unknown>;
        const dstData = dropTarget.data as Record<string, unknown>;

        if (
          (srcData.type === "stride:todo" ||
            srcData.type === "stride:unscheduled") &&
          dstData.type === "stride:slot"
        ) {
          const todoId = srcData.todoId as string;
          const slotDate = new Date(dstData.date as string);
          const hour = dstData.hour as number;
          const minute = typeof dstData.minute === "number" ? dstData.minute : 0;
          if (hour >= 0) {
            slotDate.setHours(hour, minute, 0, 0);
          } else {
            slotDate.setHours(8, 0, 0, 0);
          }
          handleDrop(todoId, slotDate);
        }

        if (
          (srcData.type === "stride:todo" ||
            srcData.type === "stride:unscheduled") &&
          dstData.type === "stride:unscheduled-drop"
        ) {
          const todoId = srcData.todoId as string;
          handleUnschedule(todoId);
        }
      },
    });
    return () => monitorCleanupRef.current?.();
  }, [handleDrop, handleUnschedule]);

  return (
    <div className="stride-root">
      <StrideHeader
        view={view}
        anchor={anchor}
        customDays={customDays}
        isPending={isPending}
        onViewChange={setView}
        onNavigate={handleNavigate}
        onGoToday={handleGoToday}
        onCustomDaysChange={setCustomDays}
        onToggleUnscheduled={() => setShowUnscheduled((v) => !v)}
        showUnscheduled={showUnscheduled}
        window={window}
      />
      <div className={`stride-body${showUnscheduled ? " stride-body--with-panel" : ""}`}>
        <div className="stride-calendar-area">
          {view === "day" && (
            <StrideDayView
              anchor={anchor}
              todos={todos}
              onToggle={handleToggle}
              onDurationChange={handleDurationChange}
              onCreateTodo={handleCreateTodo}
              onUpdateText={handleUpdateText}
              onDelete={handleDeleteTodo}
            />
          )}
          {view === "week" && (
            <StrideWeekView
              anchor={anchor}
              todos={todos}
              onToggle={handleToggle}
              onDurationChange={handleDurationChange}
              onCreateTodo={handleCreateTodo}
              onUpdateText={handleUpdateText}
              onDelete={handleDeleteTodo}
            />
          )}
          {view === "month" && (
            <StrideMonthView
              anchor={anchor}
              todos={todos}
              onToggle={handleToggle}
            />
          )}
          {view === "custom" && (
            <StrideWeekView
              anchor={anchor}
              todos={todos}
              onToggle={handleToggle}
              onDurationChange={handleDurationChange}
              onCreateTodo={handleCreateTodo}
              onUpdateText={handleUpdateText}
              onDelete={handleDeleteTodo}
              customDays={customDays}
            />
          )}
        </div>
        {showUnscheduled && (
          <StrideUnscheduled
            todos={unscheduled}
            onToggle={handleToggle}
            onUpdateText={handleUpdateText}
            onDelete={handleDeleteTodo}
          />
        )}
      </div>
    </div>
  );
}
