"use client";

import { useState, useTransition } from "react";
import { Database, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { loadDemoDataAction, removeDemoDataAction } from "@/lib/actions/demo";

export function DemoDataPanel({ demoLoaded, realStudents }: { demoLoaded: boolean; realStudents: number }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(demoLoaded);
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await loadDemoDataAction();
        setLoaded(true);
        setPassword(r.password);
        toast("Demo data loaded.");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function remove() {
    if (!window.confirm("Remove all demo students, the demo recruiter and their drives? Your real data is not touched.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeDemoDataAction();
        setLoaded(false);
        setPassword(null);
        toast("Demo data removed.");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div>
      <p className="text-sm text-muted">
        Fill an empty college with 10 sample MCA and MBA students, a demo recruiter and two drives, so you can show the whole
        flow without typing data. Everything it creates is labelled demo and can be removed in one click. It is disabled once
        real students exist.
      </p>

      {password && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Demo password (shown once — copy it now):</p>
          <p className="mt-1 font-mono text-base select-all">{password}</p>
          <p className="mt-2 text-xs">
            Students sign in with a roll number from 21MC101 to 21MC108 or 21MB104 to 21MB110. The recruiter signs in with
            recruiter@demo.clink.local.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!loaded ? (
          <Button size="sm" onClick={load} disabled={isPending || realStudents > 0}>
            <Database className="h-3.5 w-3.5" />
            {isPending ? "Loading..." : "Load demo data"}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={remove} disabled={isPending}>
            <Trash2 className="h-3.5 w-3.5" />
            {isPending ? "Removing..." : "Remove demo data"}
          </Button>
        )}
        {!loaded && realStudents > 0 && <span className="text-xs text-muted">Disabled — real students exist.</span>}
      </div>
    </div>
  );
}
