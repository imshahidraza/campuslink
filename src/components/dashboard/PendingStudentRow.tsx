"use client";

import { useTransition } from "react";
import { deletePendingStudentAction } from "@/lib/actions/college";
import { useToast } from "@/components/ui/Toast";
import { X } from "lucide-react";

export function PendingStudentRow({
  student,
}: {
  student: { id: string; rollNo: string; name: string; program: string; branch: string; cgpa: number };
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  return (
    <tr className="border-b border-border-soft last:border-0">
      <td className="py-3 text-ink">{student.rollNo}</td>
      <td className="py-3 text-ink font-medium">{student.name}</td>
      <td className="py-3 text-muted">{student.program}</td>
      <td className="py-3 text-muted">{student.branch}</td>
      <td className="py-3 text-muted">{student.cgpa.toFixed(2)}</td>
      <td className="py-3">
        <button
          onClick={() => startTransition(async () => { await deletePendingStudentAction(student.id); toast(`Removed ${student.rollNo} from the pending roster.`, "info"); })}
          disabled={isPending}
          className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Remove
        </button>
      </td>
    </tr>
  );
}
