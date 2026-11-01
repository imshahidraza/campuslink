import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { OfferRow } from "@/components/dashboard/OfferRow";

export default async function OffersPage() {
  const offers = await prisma.application.findMany({
    where: { stage: { in: ["OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"] } },
    include: { student: { include: { user: true } }, drive: true },
    orderBy: { updatedAt: "desc" },
  });

  const needsReview = offers.filter((o) => o.stage === "OFFER_REQUESTED");
  const inProgress = offers.filter((o) => o.stage === "OFFER_SENT" || o.stage === "OFFER_ACCEPTED");
  const resolved = offers.filter((o) => o.stage === "OFFER_DECLINED" || o.stage === "JOINED");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Offers &amp; Joining</h1>
      <p className="text-muted text-sm mt-1">
        Recruiters request offers after marking a candidate Selected — review and forward them here, then
        track document verification and joining.
      </p>

      {needsReview.length > 0 && (
        <Card className="mt-8 border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle>Awaiting your review ({needsReview.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
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
        <CardContent className="pt-0">
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
          <CardContent className="pt-0">
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
              No offers yet — these appear once a recruiter requests one for a Selected candidate.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
