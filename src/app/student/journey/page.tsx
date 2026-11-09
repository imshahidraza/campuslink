import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { OfferResponseButtons } from "@/components/dashboard/OfferResponseButtons";
import { TERMINAL_STAGES } from "@/lib/rules";
import { journeyLabel } from "@/lib/utils";
import { getDocumentsEmail } from "@/lib/college";
import { Check, Sparkles } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

const STEP_INDEX: Record<string, number> = {
  ELIGIBLE: 0,
  SHORTLISTED: 1,
  INTERVIEW: 2,
  SELECTED: 3,
  OFFER_REQUESTED: 4,
  OFFER_SENT: 5,
  OFFER_ACCEPTED: 6,
  JOINED: 8,
};

/** The steps a student sees. Documents are checked by the placement cell over email, between accepting and joining. */
function stepsFor(documentsVerified: boolean) {
  return [
    "Applied",
    "Shortlisted",
    "Interview",
    "Selected",
    "Offer requested",
    "Offer sent",
    "Offer accepted",
    documentsVerified ? "Documents verified" : "Documents verification pending",
    "Joined",
  ];
}

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

  const docsEmail = await getDocumentsEmail();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Placement Journey</h1>
      <p className="text-muted text-sm mt-1">Follow each application from applying to joining.</p>

      <div className="mt-8 space-y-5">
        {student.applications.length === 0 && (
          <p className="text-sm text-muted">You have not applied to any drive yet. Open Drives &amp; Matching to get started.</p>
        )}
        {student.applications.map((app) => {
          const isTerminal = (TERMINAL_STAGES as readonly string[]).includes(app.stage);
          const steps = stepsFor(app.documentsVerified);
          let currentIndex = isTerminal ? -1 : (STEP_INDEX[app.stage] ?? 0);
          if (app.stage === "OFFER_ACCEPTED" && app.documentsVerified) currentIndex = 7;
          return (
            <Card key={app.id}>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{app.drive.jobRole}</CardTitle>
                  <p className="text-sm text-muted">{app.drive.companyName}</p>
                </div>
                {app.stage === "REJECTED" && <Badge tone="danger">Not selected</Badge>}
                {app.stage === "OFFER_DECLINED" && <Badge tone="neutral">Offer declined</Badge>}
                {app.stage === "WITHDRAWN" && <Badge tone="neutral">Withdrawn</Badge>}
                {!isTerminal && <Badge tone="brand">{journeyLabel(app.stage, app.documentsVerified)}</Badge>}
              </CardHeader>
              <CardContent>
                {!isTerminal && (
                  <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
                    <div className="flex items-center min-w-[860px] sm:min-w-[860px]">
                      {steps.map((label, i) => (
                        <div key={i} className="flex items-center flex-1 last:flex-none">
                          <div className="flex flex-col items-center gap-1.5">
                            <div
                              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                                i <= currentIndex
                                  ? "bg-accent-lime text-brand-950"
                                  : "bg-surface-2 text-muted"
                              }`}
                            >
                              {i <= currentIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </div>
                            <span className={`text-[11px] whitespace-nowrap ${i === currentIndex + 1 && app.stage === "OFFER_ACCEPTED" ? "text-ink font-medium" : "text-muted"}`}>{label}</span>
                          </div>
                          {i < steps.length - 1 && (
                            <div
                              className={`h-px flex-1 mx-2 ${i < currentIndex ? "bg-accent-lime" : "bg-border-soft"}`}
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
                      <p className="text-sm text-muted mt-1 whitespace-pre-line">{app.feedbackNote}</p>
                    </div>
                  </div>
                )}

                {app.offerPackage && (
                  <p className="mt-4 text-sm text-ink">
                    <span className="font-medium">Offer package: </span>
                    {app.offerPackage}
                  </p>
                )}
                {app.offerMessage && ["OFFER_SENT", "OFFER_ACCEPTED", "JOINED", "OFFER_DECLINED"].includes(app.stage) && (
                  <div className="mt-3 rounded-xl bg-surface border border-border-soft p-4">
                    <p className="text-xs text-muted mb-1">Message from {app.drive.companyName}</p>
                    <p className="text-sm text-ink whitespace-pre-line leading-relaxed">{app.offerMessage}</p>
                  </div>
                )}
                {app.stage === "SELECTED" && app.offerWithdrawnNote && (
                  <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <p className="text-sm text-ink font-medium">{app.drive.companyName} withdrew the offer</p>
                    <p className="text-sm text-muted mt-1 whitespace-pre-line leading-relaxed">{app.offerWithdrawnNote}</p>
                    <p className="text-xs text-muted mt-2">You are still selected for this drive. The company may send a corrected offer.</p>
                  </div>
                )}

                {app.stage === "OFFER_SENT" && <OfferResponseButtons applicationId={app.id} docsEmail={docsEmail} />}

                {app.stage === "OFFER_ACCEPTED" && (
                  <div className="mt-4 rounded-xl bg-brand-100/40 border border-brand-200 p-4">
                    <p className="text-sm text-ink font-medium">
                      {app.documentsVerified ? "Your documents are verified" : "Documents verification pending"}
                    </p>
                    <p className="text-sm text-muted mt-1 leading-relaxed">
                      {app.documentsVerified
                        ? "The placement cell will mark you as joined once you report to the company."
                        : docsEmail
                          ? `Please email your important documents to ${docsEmail} for verification. The placement cell will update your profile as joined after that.`
                          : "Please send your important documents to the placement cell for verification. They will update your profile as joined after that."}
                    </p>
                  </div>
                )}
                {app.stage === "JOINED" && (
                  <p className="mt-4 text-sm text-emerald-700 font-medium">You have joined {app.drive.companyName}. Congratulations!</p>
                )}

                {app.interviews.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border-soft space-y-2">
                    {app.interviews.map((iv) => (
                      <p key={iv.id} className="text-sm text-muted">
                        <span className="text-ink font-medium">{iv.stage}</span>,{" "}
                        {fmtDateTime(iv.scheduledAt)}
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
