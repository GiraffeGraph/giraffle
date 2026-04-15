import { Suspense } from "react";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { StrideCalendar } from "@/components/stride/StrideCalendar";
import {
  getCalendarTodosAction,
  getUnscheduledTodosAction,
} from "@/server/api/notes";

export const dynamic = "force-dynamic";

export default async function StridePage() {
  // Initial window: current week (Sun–Sat)
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [initialTodos, initialUnscheduled] = await Promise.all([
    getCalendarTodosAction(weekStart, weekEnd),
    getUnscheduledTodosAction(),
  ]);

  const serializedTodos = initialTodos.map((t) => ({
    ...t,
    dueDate: t.dueDate ? new Date(t.dueDate) : null,
    note: t.note,
  }));

  const serializedUnscheduled = initialUnscheduled.map((t) => ({
    ...t,
    dueDate: null as Date | null,
  }));

  return (
    <>
      <PageTopbar icon="calendar_month" label="Stride" />
      <Suspense>
        <StrideCalendar
          initialTodos={serializedTodos}
          initialUnscheduled={serializedUnscheduled}
        />
      </Suspense>
    </>
  );
}
