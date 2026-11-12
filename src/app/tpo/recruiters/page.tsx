import { prisma } from "@/lib/prisma";
import { Badge, Card, CardContent } from "@/components/ui/Card";
import { RecruiterApprovalButtons } from "@/components/dashboard/RecruiterApprovalButtons";
import { fmtDate } from "@/lib/format";
import { SafeLink } from "@/components/ui/SafeLink";
import { KeyPeopleStrip } from "@/components/dashboard/KeyPeopleStrip";
import { keyPersonSelect, toKeyPersonView, MAX_KEY_PEOPLE } from "@/lib/keyPeopleShared";

const statusTone = { PENDING: "warning", APPROVED: "success", DECLINED: "danger" } as const;
const statusText = { PENDING: "Waiting for approval", APPROVED: "Approved", DECLINED: "Declined" } as const;

export default async function RecruitersPage() {
  const recruiters = await prisma.recruiter.findMany({
    include: {
      user: { select: { name: true, email: true, phone: true } },
      _count: { select: { drives: true } },
      keyPeople: { orderBy: { position: "asc" }, take: MAX_KEY_PEOPLE, select: keyPersonSelect },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const order = { PENDING: 0, APPROVED: 1, DECLINED: 2 } as const;
  recruiters.sort((a, b) => order[a.status] - order[b.status]);
  const waiting = recruiters.filter((r) => r.status === "PENDING").length;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Recruiters</h1>
      <p className="text-muted text-sm mt-1">
        {recruiters.length} recruiter account{recruiters.length === 1 ? "" : "s"}
        {waiting > 0 ? `, ${waiting} waiting for your approval.` : "."} A recruiter can post drives only after you
        approve the account.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {recruiters.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink break-words">{r.companyName}</p>
                  {r.industry && <p className="text-xs text-muted mt-1">{r.industry}</p>}
                </div>
                <Badge tone={statusTone[r.status]} className="shrink-0">
                  {statusText[r.status]}
                </Badge>
              </div>
              {r.website && (
                <p className="text-xs mt-2">
                  <SafeLink href={r.website} />
                </p>
              )}
              {r.companyDesc && <p className="text-sm text-muted mt-3 leading-relaxed">{r.companyDesc}</p>}
              <KeyPeopleStrip people={r.keyPeople.map(toKeyPersonView)} className="mt-4" />
              <div className="mt-3 space-y-1 text-xs text-muted">
                <p>
                  {r.user.name}
                  {r.contactRole ? `, ${r.contactRole}` : ""} · {r.user.email}
                </p>
                {r.user.phone && <p>{r.user.phone}</p>}
                <p>
                  {r._count.drives} drive{r._count.drives === 1 ? "" : "s"} · signed up {fmtDate(r.createdAt)}
                </p>
              </div>
              <RecruiterApprovalButtons recruiterId={r.id} status={r.status} />
            </CardContent>
          </Card>
        ))}
        {recruiters.length === 0 && <p className="text-sm text-muted">No recruiters have signed up yet.</p>}
      </div>
    </div>
  );
}
