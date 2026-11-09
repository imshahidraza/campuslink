"use client";

import { useMemo, useState, useTransition } from "react";
import { addSpecializationAction, deleteSpecializationAction } from "@/lib/actions/college";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { X } from "lucide-react";

interface Specialization {
  id: string;
  program: string;
  name: string;
}

const inputCls =
  "w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300";

export function CollegeSetupForm({ initialSpecializations }: { initialSpecializations: Specialization[] }) {
  const { toast } = useToast();
  const [specializations, setSpecializations] = useState(initialSpecializations);
  // Both boxes start empty. The examples are grey placeholders only.
  const [program, setProgram] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groupedPrograms = useMemo(() => {
    const programs = Array.from(new Set(specializations.map((s) => s.program)));
    return programs.sort().map((p) => ({ program: p, items: specializations.filter((s) => s.program === p) }));
  }, [specializations]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !program.trim()) return;
    setError(null);
    const upperName = name.trim().toUpperCase();
    const programTrimmed = program.trim();

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("program", programTrimmed);
        fd.set("name", upperName);
        const created = await addSpecializationAction(fd);
        setSpecializations((prev) => {
          const withoutDuplicate = prev.filter((s) => s.id !== created.id);
          return [...withoutDuplicate, { id: created.id, program: created.program, name: created.name }];
        });
        setName("");
        toast(`Added ${upperName} under ${created.program}.`);
      } catch (err) {
        setError((err as Error).message);
        toast((err as Error).message, "error");
      }
    });
  }

  function handleDelete(id: string, label: string) {
    startTransition(async () => {
      try {
        await deleteSpecializationAction(id);
        setSpecializations((prev) => prev.filter((s) => s.id !== id));
        toast(`Removed ${label}.`, "info");
      } catch (err) {
        setError((err as Error).message);
        toast((err as Error).message, "error");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted mb-1.5 block">Program</label>
          <input
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            placeholder="e.g. MCA"
            autoComplete="off"
            className={inputCls}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted mb-1.5 block">Specialization</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Data Science"
            autoComplete="off"
            className={inputCls}
          />
        </div>
        <Button type="submit" disabled={isPending || !name.trim() || !program.trim()} size="md">
          Add
        </Button>
      </form>

      {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

      {groupedPrograms.length === 0 && (
        <p className="text-sm text-muted">Nothing added yet. Add a program and its specializations above.</p>
      )}

      <div className="space-y-6">
        {groupedPrograms.map((g) => (
          <div key={g.program}>
            <p className="text-sm font-medium text-ink mb-2">{g.program}</p>
            <div className="flex flex-wrap gap-2">
              {g.items.map((s) => (
                <Badge key={s.id} tone="brand" className="pr-1.5 gap-1.5">
                  {s.name}
                  <button
                    onClick={() => handleDelete(s.id, `${s.name} (${s.program})`)}
                    disabled={isPending}
                    className="hover:bg-brand-200/60 rounded-full p-0.5"
                    aria-label={`Remove ${s.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
