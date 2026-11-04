import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { RosterPasteForm } from "@/components/dashboard/RosterPasteForm";
import { ArrowLeft } from "lucide-react";

export default function AddStudentsPage() {
  return (
    <div>
      <Link href="/tpo/students" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to students
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Add Students</h1>
      <p className="text-muted text-sm mt-1">
        Import your students here, with their assessment scores if you have them. Each student then claims their
        record by signing up with their roll number.
      </p>

      <Card className="mt-8 max-w-3xl">
        <CardHeader>
          <CardTitle>Paste or import students</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <RosterPasteForm />
        </CardContent>
      </Card>
    </div>
  );
}
