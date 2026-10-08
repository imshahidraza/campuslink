"use client";

import { useEffect, useState } from "react";
import { Circle } from "lucide-react";

export function OllamaStatus() {
  const [state, setState] = useState<"loading" | "ok" | "down">("loading");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/ollama")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setState(data.ok ? "ok" : "down");
        setDetail(data.detail);
      })
      .catch(() => {
        if (!cancelled) {
          setState("down");
          setDetail("Could not reach /api/health/ollama");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const color = state === "ok" ? "text-emerald-400" : state === "down" ? "text-rose-400" : "text-white/30";
  const label = state === "loading" ? "Checking Gemma..." : state === "ok" ? "Gemma connected" : "Gemma offline";

  return (
    <div title={detail} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/50">
      <Circle className={`h-2 w-2 fill-current ${color}`} />
      {label}
    </div>
  );
}
