import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/Card";
import { OfferRow } from "@/components/dashboard/OfferRow";

export default async function OffersPage() {
  const offers = await prisma.application.findMany({
    where: { stage: "OFFER" },
    include: { student: { include: { user: true } }, drive: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Offers &amp; Joining</h1>
      <p className="text-muted text-sm mt-1">Track document verification and joining status for every offer.</p>

      <Card className="mt-8">
        <CardContent className="pt-5">
          {offers.length === 0 && <p className="text-sm text-muted">No offers recorded yet.</p>}
          {offers.map((app) => (
            <OfferRow key={app.id} application={app} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
