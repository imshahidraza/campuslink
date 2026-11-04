"use client";

import { Fragment, useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import {
  deletePendingStudentAction,
  updatePendingStudentAction,
  updateRegisteredStudentAction,
} from "@/lib/actions/college";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { readinessLabel, stageLabel } from "@/lib/utils";

export interface StudentRowData {
  id: string;
  rollNo: string;
  name: string;
  program: string | null;
  branch: string;
  cgpa: number;
  backlogs: number;
  graduationYear: number;
  aptitudeScore: number | null;
  reasoningScore: number | null;
  verbalScore: number | null;
  communicationScore: number | null;
  readinessLevel?: string | null;
  placementStatus?: string;
}

const inputCls =
  "mt-1 w-full rounded-lg border border-border-soft bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand-300";

function scoresText(s: StudentRowData) {
  const parts = [
    ["A", s.aptitudeScore],
    ["R", s.reasoningScore],
    ["V", s.verbalScore],
    ["C", s.communicationScore],
  ] as const;
  const filled = parts.filter(([, v]) => v != null);
  return filled.length ? filled.map(([k, v]) => `${k} ${v}`).join(" · ") : "No scores";
}

/** One table row for a student, with an inline Edit form. Works for pending (not signed up) and registered students. */
export function StudentEditRow({ student, kind }: { student: StudentRowData; kind: "pending" | "registered" }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const pending = kind === "pending";

  function save(formData: FormData) {
    startTransition(async () => {
      try {
        if (pending) await updatePendingStudentAction(student.id, formData);
        else await updateRegisteredStudentAction(student.id, formData);
        toast("Student details saved.");
        setEditing(false);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  return (
    <Fragment>
      <tr className="border-b border-border-soft last:border-0">
        <td className="py-3 pr-3 text-ink whitespace-nowrap">{student.rollNo}</td>
        <td className="py-3 pr-3 text-ink font-medium">{student.name}</td>
        <td className="py-3 pr-3 text-muted">{student.program || "-"}</td>
        <td className="py-3 pr-3 text-muted">{student.branch}</td>
        <td className="py-3 pr-3 text-muted">{student.cgpa.toFixed(2)}</td>
        {!pending && <td className="py-3 pr-3 text-muted">{student.backlogs}</td>}
        <td className="py-3 pr-3 text-muted whitespace-nowrap text-xs">{scoresText(student)}</td>
        {!pending && (
          <>
            <td className="py-3 pr-3">
              <Badge tone={student.readinessLevel === "HIGHLY_READY" ? "success" : "neutral"}>
                {readinessLabel(student.readinessLevel)}
              </Badge>
            </td>
            <td className="py-3 pr-3">
              <Badge tone="brand">{stageLabel(student.placementStatus ?? "UNPLACED")}</Badge>
            </td>
          </>
        )}
        <td className="py-3">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <button
              onClick={() => setEditing((e) => !e)}
              className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
            >
              <Pencil className="h-3 w-3" /> {editing ? "Close" : "Edit"}
            </button>
            {pending && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    await deletePendingStudentAction(student.id);
                    toast(`Removed ${student.rollNo} from the pending list.`, "info");
                  })
                }
                disabled={isPending}
                className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            )}
          </div>
        </td>
      </tr>

      {editing && (
        <tr className="border-b border-border-soft bg-surface">
          <td colSpan={pending ? 7 : 10} className="p-4">
            <form action={save} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="text-xs text-muted">
                Roll number
                <input
                  name="rollNo"
                  defaultValue={student.rollNo}
                  readOnly={!pending}
                  className={`${inputCls} ${!pending ? "bg-surface-2 text-muted" : ""}`}
                />
              </label>
              <label className="text-xs text-muted col-span-1 sm:col-span-2">
                Name
                <input name="name" defaultValue={student.name} required className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                Graduation year
                <input name="graduationYear" type="number" defaultValue={student.graduationYear} required className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                Program
                <input name="program" defaultValue={student.program ?? ""} required className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                Specialization
                <input name="branch" defaultValue={student.branch} required className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                CGPA
                <input name="cgpa" type="number" step="0.01" min={0} max={10} defaultValue={student.cgpa} required className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                Backlogs
                <input name="backlogs" type="number" min={0} defaultValue={student.backlogs} required className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                Aptitude
                <input name="aptitudeScore" type="number" min={0} max={100} defaultValue={student.aptitudeScore ?? ""} className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                Reasoning
                <input name="reasoningScore" type="number" min={0} max={100} defaultValue={student.reasoningScore ?? ""} className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                Verbal
                <input name="verbalScore" type="number" min={0} max={100} defaultValue={student.verbalScore ?? ""} className={inputCls} />
              </label>
              <label className="text-xs text-muted">
                Communication
                <input name="communicationScore" type="number" min={0} max={100} defaultValue={student.communicationScore ?? ""} className={inputCls} />
              </label>
              <div className="col-span-2 sm:col-span-4 flex items-center gap-2">
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? "Saving..." : "Save changes"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                {!pending && (
                  <span className="text-xs text-muted">The roll number is the student&apos;s sign-in, so it can&apos;t be changed.</span>
                )}
              </div>
            </form>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
