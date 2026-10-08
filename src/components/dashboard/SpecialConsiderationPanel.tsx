"use client";

import { useMemo, useState, useTransition } from "react";
import { addSpecialConsiderationAction, removeSpecialConsiderationAction } from "@/lib/actions/matching";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Search, Sparkles, X, Award } from "lucide-react";

interface StudentOption {
  id: string;
  rollNo: string;
  name: string;
  branch: string;
  cgpa: number;
}

interface Recommended {
  id: string; // application id
  studentId: string;
  rollNo: string;
  name: string;
  note: string | null;
  fitScore: number | null;
}

export function SpecialConsiderationPanel({
  driveId,
  allStudents,
  initialRecommended,
}: {
  driveId: string;
  allStudents: StudentOption[];
  initialRecommended: Recommended[];
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StudentOption | null>(null);
  const [note, setNote] = useState("");
  const [recommended, setRecommended] = useState(initialRecommended);
  const [isPending, startTransition] = useTransition();

  const recommendedStudentIds = new Set(recommended.map((r) => r.studentId));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allStudents
      .filter((s) => !recommendedStudentIds.has(s.id))
      .filter((s) => s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, allStudents, recommended]);

  function handleAdd() {
    if (!selected) return;
    startTransition(async () => {
      try {
        const app = await addSpecialConsiderationAction(driveId, selected.id, note);
        setRecommended((prev) => [
          ...prev,
          { id: app.id, studentId: selected.id, rollNo: selected.rollNo, name: selected.name, note: app.specialConsiderationNote, fitScore: app.fitScore },
        ]);
        toast(`${selected.name} added as a TPO Recommendation.`);
        setSelected(null);
        setQuery("");
        setNote("");
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  function handleRemove(r: Recommended) {
    startTransition(async () => {
      try {
        await removeSpecialConsiderationAction(r.id);
        setRecommended((prev) => prev.filter((x) => x.id !== r.id));
        toast(`Removed ${r.name} from special consideration.`, "info");
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted leading-relaxed">
        Recommend a student who doesn&apos;t meet this drive&apos;s automatic eligibility rules but whose
        skills/projects justify a look. They&apos;ll be clearly labeled to the recruiter — this doesn&apos;t
        guarantee selection or skip any normal review step.
      </p>

      {!selected ? (
        <div className="relative">
          <div className="flex items-center gap-2 rounded-xl border border-border-soft bg-surface px-3 py-2">
            <Search className="h-4 w-4 text-muted shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or roll number..."
              className="w-full bg-transparent text-sm text-ink focus:outline-none"
            />
          </div>
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-border-soft bg-white shadow-lg overflow-hidden">
              {results.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelected(s);
                    setQuery("");
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-surface transition-colors border-b border-border-soft last:border-0"
                >
                  <span className="text-ink font-medium">{s.name}</span>{" "}
                  <span className="text-muted">
                    · {s.rollNo} · {s.branch} · CGPA {s.cgpa.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border-soft bg-surface p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink">
              <span className="font-medium">{selected.name}</span>{" "}
              <span className="text-muted">
                · {selected.rollNo} · {selected.branch} · CGPA {selected.cgpa.toFixed(2)}
              </span>
            </p>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the recruiter — why you're recommending them (e.g. strong portfolio despite CGPA)"
            rows={2}
            className="w-full mt-2 rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300"
          />
          <Button onClick={handleAdd} disabled={isPending} size="sm" className="mt-2">
            <Sparkles className="h-3.5 w-3.5" />
            {isPending ? "Adding..." : "Add recommendation"}
          </Button>
        </div>
      )}

      {recommended.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border-soft">
          {recommended.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="text-ink font-medium flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" /> {r.name}{" "}
                  <span className="text-muted font-normal">· {r.rollNo}</span>
                </p>
                {r.note && <p className="text-xs text-muted mt-0.5">{r.note}</p>}
              </div>
              <button
                onClick={() => handleRemove(r)}
                disabled={isPending}
                className="text-xs text-rose-500 hover:text-rose-600 shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
