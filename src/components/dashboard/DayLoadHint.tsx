"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { dayLoadAction } from "@/lib/actions/scheduling";

type Load = { count: number; items: { time: string; panel: string | null; venue: string | null }[] };

/** A plain-words note under a date field: how many interviews are already booked that day, and when. */
export function DayLoadHint({ date }: { date: string }) {
  const [load, setLoad] = useState<{ date: string; data: Load } | null>(null);
  const day = date.slice(0, 10);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    let cancelled = false;
    dayLoadAction(day)
      .then((data) => {
        if (!cancelled) setLoad({ date: day, data });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [day]);

  if (!load || load.date !== day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const { count, items } = load.data;

  return (
    <p className={`mt-1.5 flex items-start gap-1.5 text-xs ${count > 0 ? "text-amber-700" : "text-emerald-700"}`}>
      <CalendarDays className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        {count === 0
          ? "Nothing scheduled on this day yet."
          : `${count} interview${count === 1 ? "" : "s"} already scheduled this day: ${items
              .map((i) => `${i.time}${i.panel ? ` (${i.panel})` : ""}`)
              .join(", ")}${count > items.length ? " and more" : ""}.`}
      </span>
    </p>
  );
}
