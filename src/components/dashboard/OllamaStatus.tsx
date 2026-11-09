"use client";

import { useEffect, useState } from "react";
import { Circle } from "lucide-react";

export function OllamaStatus() {
  const [state, setState] = useState<"loading" | "ok" | "down">("loading");
  const [detail, setDetail] = useState("");
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/ollama")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setState(data.ok ? "ok" : "down");
        setDetail(data.detail);
        setWaiting(Number(data.queue?.waiting) || 0);
      })
      .catch(() => {
        if (!cancelled) {
          setState("down");
          setDetail("Could not check Gemma.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const color = state === "ok" ? "text-emerald-400" : state === "down" ? "text-rose-400" : "text-white/30";
  const label =
    state === "loading"
      ? "Checking Gemma..."
      : state === "ok"
        ? waiting > 0
          ? `Gemma busy, ${waiting} waiting`
          : "Gemma connected"
        : "Gemma offline";

  return (
    <div title={detail} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/50">
      <Circle className={`h-2 w-2 fill-current ${color}`} />
      {label}
    </div>
  );
}
