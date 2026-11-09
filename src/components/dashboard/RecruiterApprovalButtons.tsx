"use client";

import { useTransition } from "react";
import { approveRecruiterAction, declineRecruiterAction } from "@/lib/actions/recruiterApproval";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function RecruiterApprovalButtons({
  recruiterId,
  status,
}: {
  recruiterId: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function run(action: (id: string) => Promise<void>, message: string) {
    startTransition(async () => {
      try {
        await action(recruiterId);
        toast(message);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {status !== "APPROVED" && (
        <Button size="sm" disabled={isPending} onClick={() => run(approveRecruiterAction, "Recruiter approved.")}>
          {isPending ? "Saving..." : "Approve"}
        </Button>
      )}
      {status !== "DECLINED" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => run(declineRecruiterAction, status === "APPROVED" ? "Access removed." : "Recruiter declined.")}
        >
          {status === "APPROVED" ? "Remove access" : "Decline"}
        </Button>
      )}
    </div>
  );
}
