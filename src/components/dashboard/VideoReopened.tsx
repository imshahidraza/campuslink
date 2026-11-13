"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { checkVideoSessionAction } from "@/lib/actions/videoStudent";

/**
 * Shown when this page opens on an interview that is still marked "in progress". The page that is recording keeps its
 * state in memory, so this cannot be that page: either the student refreshed or reopened it (the recording stopped),
 * or the interview is still running in another window. The server decides: once nothing has arrived for a few seconds,
 * it closes the interview as interrupted, and this page then shows the result.
 */
export function VideoReopened({ driveId }: { driveId: string }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let stopped = false;
    async function check() {
      const r = await checkVideoSessionAction(driveId);
      if (stopped) return;
      if (r.ok && r.data.stage !== "IN_PROGRESS") {
        stopped = true;
        router.refresh();
      }
    }
    void check();
    const poll = setInterval(() => void check(), 3000);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [driveId, router]);

  return (
    <Card className="mt-6">
      <CardContent className="pt-5">
        <h2 className="text-lg font-semibold text-ink">Checking your interview</h2>
        <p className="text-sm text-muted mt-2 leading-relaxed" role="status">
          {seconds < 40
            ? "This interview was already started. If you refreshed or reopened this page, the recording has stopped. We are checking whether it is still running in another window, and this takes a few seconds."
            : "The interview still seems to be running in another window. Please go back to that window and finish it there. This page cannot take over a recording."}
        </p>
        <p className="text-xs text-muted mt-3">If nothing arrives from the first window, the interview is closed and what was recorded is kept.</p>
      </CardContent>
    </Card>
  );
}
