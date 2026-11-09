import { FileText } from "lucide-react";

/** Opens the student's resume PDF in a new tab. The route re-checks permission on every request. */
export function ViewResumeLink({ studentId, hasResume }: { studentId: string; hasResume: boolean }) {
  if (!hasResume) {
    return <span className="text-xs text-muted">No resume</span>;
  }
  return (
    <a
      href={`/api/resume/${studentId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600"
    >
      <FileText className="h-3.5 w-3.5" /> View resume
    </a>
  );
}
