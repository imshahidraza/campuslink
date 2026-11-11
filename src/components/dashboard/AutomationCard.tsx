"use client";

import { useState, useTransition } from "react";
import { runChecksNowAction } from "@/lib/actions/automation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DOCUMENT_DEADLINE_DAYS, DOCUMENT_REMINDER_DAYS_BEFORE, OFFER_FOLLOW_UP_AFTER_DAYS, OFFER_FOLLOW_UP_MAX } from "@/lib/automationRules";

export function AutomationCard() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  return (
    <Card className="mt-8">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Automatic reminders</CardTitle>
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              {
                const res = await runChecksNowAction();
                if (!res.ok) return toast(res.error, "error");
                const r = res.data;
                const parts = [
                  `${r.documentReminders} document reminder${r.documentReminders === 1 ? "" : "s"}`,
                  `${r.overdueDocuments} overdue`,
                  `${r.offerFollowUps} offer follow-up${r.offerFollowUps === 1 ? "" : "s"}`,
                  `${r.newlyFlagged} added to the support list`,
                ];
                setLast(parts.join(" · "));
                toast("Checks finished.");
              }
            })
          }
        >
          {isPending ? "Checking..." : "Run checks now"}
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="text-sm text-muted space-y-1.5 leading-relaxed list-disc pl-5">
          <li>
            A student who accepts an offer gets {DOCUMENT_DEADLINE_DAYS} days to send documents. They are reminded {DOCUMENT_REMINDER_DAYS_BEFORE} days before, and you are told if it passes.
          </li>
          <li>
            If a student has not answered an offer after {OFFER_FOLLOW_UP_AFTER_DAYS} days, the recruiter is prompted to follow up and the student is reminded (up to {OFFER_FOLLOW_UP_MAX} times).
          </li>
          <li>Students who may need help are added to the <a href="/tpo/support" className="underline text-ink">Support list</a>, where you choose their mentor.</li>
          <li>These are messages inside C-Link. Nothing is sent by email or SMS. The checks run by themselves when people use the app.</li>
        </ul>
        {last && <p className="text-xs text-ink mt-3">Last run: {last}.</p>}
      </CardContent>
    </Card>
  );
}
