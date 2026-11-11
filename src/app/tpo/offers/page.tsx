import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { OfferRow } from "@/components/dashboard/OfferRow";
import { getDocumentsEmail } from "@/lib/college";

export default async function OffersPage() {
  const offers = await prisma.application.findMany({
    where: { stage: { in: ["OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"] } },
    include: { student: { include: { user: true } }, drive: true },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const selectedWaiting = await prisma.application.findMany({
    where: { stage: "SELECTED" },
    include: { student: { include: { user: true } }, drive: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const docsEmail = await getDocumentsEmail();

  const needsReview = offers.filter((o) => o.stage === "OFFER_REQUESTED");
  // Joining-date requests get their own list at the top, so they are not buried among the offers in progress.
  const deferrals = offers.filter((o) => o.stage === "OFFER_ACCEPTED" && o.deferralStatus === "PENDING");
  const inProgress = offers.filter(
    (o) => (o.stage === "OFFER_SENT" || o.stage === "OFFER_ACCEPTED") && !(o.stage === "OFFER_ACCEPTED" && o.deferralStatus === "PENDING")
  );
  const resolved = offers.filter((o) => o.stage === "OFFER_DECLINED" || o.stage === "JOINED");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Offers &amp; Joining</h1>
      <p className="text-muted text-sm mt-1">
        Recruiters request an offer after selecting a candidate. Review and forward each request here. After a
        student accepts, check their documents{docsEmail ? ` (they email them to ${docsEmail})` : ""}, mark them as
        verified, then mark the student as joined.
      </p>

      {selectedWaiting.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Selected, waiting for the company ({selectedWaiting.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted mb-2">The recruiter has not requested an offer for these students yet.</p>
            {selectedWaiting.map((a) => (
              <p key={a.id} className="text-sm text-ink py-1.5 border-b border-border-soft last:border-0">
                {a.student.user.name}{" "}
                <span className="text-xs text-muted">
                  {a.student.rollNo} · {a.drive.jobRole} at {a.drive.companyName}
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {deferrals.length > 0 && (
        <Card className="mt-8 border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle>Joining date requests ({deferrals.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted mb-2">
              These students accepted an offer and ask to join later. Approving moves the joining date shown to the student and
              the recruiter.
            </p>
            {deferrals.map((app) => (
              <OfferRow key={app.id} application={app} />
            ))}
          </CardContent>
        </Card>
      )}

      {needsReview.length > 0 && (
        <Card className="mt-8 border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle>Awaiting your review ({needsReview.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {needsReview.map((app) => (
              <OfferRow key={app.id} application={app} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>In progress</CardTitle>
        </CardHeader>
        <CardContent>
          {inProgress.length === 0 && <p className="text-sm text-muted">Nothing currently in progress.</p>}
          {inProgress.map((app) => (
            <OfferRow key={app.id} application={app} />
          ))}
        </CardContent>
      </Card>

      {resolved.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            {resolved.map((app) => (
              <OfferRow key={app.id} application={app} />
            ))}
          </CardContent>
        </Card>
      )}

      {offers.length === 0 && (
        <Card className="mt-8">
          <CardContent className="pt-5">
            <p className="text-sm text-muted">
              No offers yet. They appear here once a recruiter requests one for a selected candidate.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
