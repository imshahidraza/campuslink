import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { OfferResponseButtons } from "@/components/dashboard/OfferResponseButtons";
import { APPLICATION_STAGES, TERMINAL_STAGES, stageIndex } from "@/lib/rules";
import { stageLabel } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";

export default async function JourneyPage() {
  const { student: studentBase } = await requireStudentOrRedirect();
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentBase.id },
    include: {
      applications: {
        include: { drive: true, interviews: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Placement Journey</h1>
      <p className="text-muted text-sm mt-1">Track every application from eligibility to joining.</p>

      <div className="mt-8 space-y-5">
        {student.applications.length === 0 && (
          <p className="text-sm text-muted">No applications yet — visit Drives &amp; Matching to get started.</p>
        )}
        {student.applications.map((app) => {
          const isTerminal = (TERMINAL_STAGES as readonly string[]).includes(app.stage);
          const currentIndex = isTerminal ? -1 : stageIndex(app.stage);
          return (
            <Card key={app.id}>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{app.drive.jobRole}</CardTitle>
                  <p className="text-sm text-muted">{app.drive.companyName}</p>
                </div>
                {app.stage === "REJECTED" && <Badge tone="danger">Not selected</Badge>}
                {app.stage === "OFFER_DECLINED" && <Badge tone="neutral">Offer declined</Badge>}
                {!isTerminal && <Badge tone="brand">{stageLabel(app.stage)}</Badge>}
              </CardHeader>
              <CardContent>
                {!isTerminal && (
                  <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
                    <div className="flex items-center min-w-[640px] sm:min-w-0">
                      {APPLICATION_STAGES.map((stage, i) => (
                        <div key={stage} className="flex items-center flex-1 last:flex-none">
                          <div className="flex flex-col items-center gap-1.5">
                            <div
                              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                                i <= currentIndex
                                  ? "bg-brand-500 text-white"
                                  : "bg-surface-2 text-muted"
                              }`}
                            >
                              {i <= currentIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </div>
                            <span className="text-[11px] text-muted whitespace-nowrap">{stageLabel(stage)}</span>
                          </div>
                          {i < APPLICATION_STAGES.length - 1 && (
                            <div
                              className={`h-px flex-1 mx-2 ${i < currentIndex ? "bg-brand-500" : "bg-border-soft"}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {app.stage === "REJECTED" && app.feedbackNote && (
                  <div className="rounded-xl bg-brand-100/40 border border-brand-200 p-4 flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-ink font-medium">Feedback to help you grow</p>
                      <p className="text-sm text-muted mt-1">{app.feedbackNote}</p>
                    </div>
                  </div>
                )}

                {app.offerPackage && (
                  <p className="mt-4 text-sm text-ink">
                    <span className="font-medium">Offer package: </span>
                    {app.offerPackage}
                  </p>
                )}

                {app.stage === "OFFER_SENT" && <OfferResponseButtons applicationId={app.id} />}

                {app.interviews.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border-soft space-y-2">
                    {app.interviews.map((iv) => (
                      <p key={iv.id} className="text-sm text-muted">
                        <span className="text-ink font-medium">{iv.stage}</span> —{" "}
                        {new Date(iv.scheduledAt).toLocaleString()}
                        {iv.venue ? ` · ${iv.venue}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
