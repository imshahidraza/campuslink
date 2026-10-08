"use client";

import { useMemo, useState, useTransition } from "react";
import { addSpecializationAction, deleteSpecializationAction } from "@/lib/actions/college";
import { PROGRAM_SUGGESTIONS } from "@/lib/programs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { X } from "lucide-react";

interface Specialization {
  id: string;
  program: string;
  name: string;
}

export function CollegeSetupForm({ initialSpecializations }: { initialSpecializations: Specialization[] }) {
  const { toast } = useToast();
  const [specializations, setSpecializations] = useState(initialSpecializations);
  const [program, setProgram] = useState<string>(PROGRAM_SUGGESTIONS[0]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Known programs = the example suggestions plus whatever's already in the catalog —
  // program is free text, this is just a convenience datalist, not a restriction.
  const knownPrograms = useMemo(() => {
    const fromCatalog = Array.from(new Set(specializations.map((s) => s.program)));
    return Array.from(new Set([...PROGRAM_SUGGESTIONS, ...fromCatalog])).sort();
  }, [specializations]);

  const groupedPrograms = useMemo(() => {
    const programs = Array.from(new Set(specializations.map((s) => s.program)));
    if (program.trim() && !programs.includes(program.trim())) programs.push(program.trim());
    return programs.sort().map((p) => ({ program: p, items: specializations.filter((s) => s.program === p) }));
  }, [specializations, program]);

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
        toast(`Added ${upperName} under ${programTrimmed}.`);
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
    <div className="space-y-8">
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted mb-1.5 block">Program</label>
          <input
            list="program-suggestions"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            placeholder="e.g. B.Tech — type any program"
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
          />
          <datalist id="program-suggestions">
            {knownPrograms.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted mb-1.5 block">Specialization</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Computer Science Engineering"
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
          />
        </div>
        <Button type="submit" disabled={isPending || !name.trim() || !program.trim()} size="md">
          Add
        </Button>
      </form>
      <p className="text-xs text-muted -mt-4">
        Type any program — common ones are suggested as you type. Specializations are saved uppercase
        automatically (e.g. &quot;cse&quot; and &quot;CSE&quot; become the same entry) so duplicates can&apos;t
        sneak in.
      </p>

      {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="space-y-6">
        {groupedPrograms.map((g) => (
          <div key={g.program}>
            <p className="text-sm font-medium text-ink mb-2">{g.program}</p>
            {g.items.length === 0 ? (
              <p className="text-xs text-muted">No specializations added yet.</p>
            ) : (
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
