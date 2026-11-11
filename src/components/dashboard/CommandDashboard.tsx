import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import type { OfferStats, RecruiterRow, MonthRow, BranchRow, DocJoinSummary } from "@/lib/analytics";

const fmtLpa = (n: number | null) => (n == null ? "–" : `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")} LPA`);
const fmtRupees = (n: number | null) => (n == null ? "–" : `₹${n.toLocaleString("en-IN")}`);

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { timeZone: "UTC", month: "short", year: "numeric" });
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xl font-semibold text-ink">{value}</p>
        <p className="text-xs text-muted mt-1">{label}</p>
        {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-xs text-muted border-b border-border-soft">
            {head.map((h, i) => (
              <th key={h} className={`py-2 pr-3 font-medium ${i === 0 ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const cell = "py-2 pr-3 text-right text-ink tabular-nums";

export function CommandDashboard({
  offers,
  recruiters,
  months,
  branches,
  docs,
}: {
  offers: OfferStats;
  recruiters: RecruiterRow[];
  months: MonthRow[];
  branches: BranchRow[];
  docs: DocJoinSummary;
}) {
  const repeatCount = recruiters.filter((r) => r.repeat).length;
  const maxMonth = Math.max(1, ...months.map((m) => m.offers));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
        <Tile label="Offers made" value={String(offers.made)} hint={`${offers.byType.FULL_TIME} full-time · ${offers.byType.PPO} PPO · ${offers.byType.INTERNSHIP} internship`} />
        <Tile label="Offers accepted" value={String(offers.accepted)} hint={`${offers.acceptanceRate}% of offers made`} />
        <Tile
          label="Offers pending"
          value={String(offers.awaitingStudent + offers.awaitingPlacementCell)}
          hint={`${offers.awaitingStudent} with students · ${offers.awaitingPlacementCell} with the placement cell`}
        />
        <Tile label="Average package (accepted)" value={fmtLpa(offers.acceptedPackage.average)} hint={offers.acceptedPackage.n ? `${offers.acceptedPackage.n} offer${offers.acceptedPackage.n === 1 ? "" : "s"}` : "No accepted job offers with a package yet"} />
        <Tile label="Highest package (accepted)" value={fmtLpa(offers.acceptedPackage.highest)} hint={offers.acceptedPackage.median != null ? `Median ${fmtLpa(offers.acceptedPackage.median)}` : undefined} />
        <Tile label="Internships converted to full-time" value={String(offers.conversions)} hint={offers.internshipStipend.n ? `Average stipend ${fmtRupees(offers.internshipStipend.average)} per month` : undefined} />
      </div>
      {offers.withoutNumber > 0 && (
        <p className="text-xs text-muted">
          {offers.withoutNumber} full-time offer{offers.withoutNumber === 1 ? " has" : "s have"} a package that is not written as a number of lakhs, so
          {offers.withoutNumber === 1 ? " it is" : " they are"} left out of the averages. New offers always record a number.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Package trends by recruiter</CardTitle>
        </CardHeader>
        <CardContent>
          {recruiters.filter((r) => r.offers > 0).length === 0 ? (
            <p className="text-sm text-muted">No offers have reached students yet.</p>
          ) : (
            <Table head={["Company", "Offers", "Accepted", "Average CTC", "Highest CTC"]}>
              {recruiters
                .filter((r) => r.offers > 0)
                .map((r) => (
                  <tr key={r.recruiterId} className="border-b border-border-soft last:border-0">
                    <td className="py-2 pr-3 text-ink">{r.company}</td>
                    <td className={cell}>{r.offers}</td>
                    <td className={cell}>{r.accepted}</td>
                    <td className={cell}>{fmtLpa(r.averageCtc)}</td>
                    <td className={cell}>{fmtLpa(r.highestCtc)}</td>
                  </tr>
                ))}
            </Table>
          )}
          {months.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium text-ink mb-3">Offers by month</p>
              <div className="space-y-3">
                {months.map((m) => (
                  <div key={m.month}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-ink">{monthLabel(m.month)}</span>
                      <span className="text-muted">
                        {m.offers} offer{m.offers === 1 ? "" : "s"}
                        {m.averageCtc != null ? ` · average ${fmtLpa(m.averageCtc)}` : ""}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.round((m.offers / maxMonth) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Recruiter pipeline and repeat hiring</CardTitle>
          {recruiters.length > 0 && (
            <Badge tone="brand">
              {repeatCount} of {recruiters.length} recruiter{recruiters.length === 1 ? "" : "s"} came back with more than one drive
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {recruiters.length === 0 ? (
            <p className="text-sm text-muted">No drives yet.</p>
          ) : (
            <Table head={["Company", "Drives", "Applicants", "Shortlisted or further", "Offers", "Accepted", "Joined"]}>
              {recruiters.map((r) => (
                <tr key={r.recruiterId} className="border-b border-border-soft last:border-0">
                  <td className="py-2 pr-3 text-ink">
                    {r.company}
                    {r.repeat && (
                      <Badge tone="success" className="ml-2">
                        Repeat
                      </Badge>
                    )}
                  </td>
                  <td className={cell}>{r.drives}</td>
                  <td className={cell}>{r.applicants}</td>
                  <td className={cell}>{r.advanced}</td>
                  <td className={cell}>{r.offers}</td>
                  <td className={cell}>{r.accepted}</td>
                  <td className={cell}>{r.joined}</td>
                </tr>
              ))}
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branch-wise conversion</CardTitle>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <p className="text-sm text-muted">No students yet.</p>
          ) : (
            <>
              <Table head={["Specialization", "Students", "Applied", "Shortlisted or further", "Got an offer", "Placed", "Placed of applied"]}>
                {branches.map((b) => (
                  <tr key={b.branch} className="border-b border-border-soft last:border-0">
                    <td className="py-2 pr-3 text-ink">{b.branch}</td>
                    <td className={cell}>{b.students}</td>
                    <td className={cell}>{b.applied}</td>
                    <td className={cell}>{b.advanced}</td>
                    <td className={cell}>{b.offered}</td>
                    <td className={cell}>{b.placed}</td>
                    <td className={cell}>{b.applied ? `${b.placedOfApplied}%` : "–"}</td>
                  </tr>
                ))}
              </Table>
              <p className="text-xs text-muted mt-3">Placed means a Full-time or PPO offer that the student accepted. An internship alone does not count as placed.</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents and joining</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Mini label="Offers accepted" value={docs.accepted} />
            <Mini label="Documents verified" value={docs.documentsVerified} />
            <Mini label="Documents pending" value={docs.documentsPending} warn={docs.documentsOverdue > 0 ? `${docs.documentsOverdue} overdue` : undefined} />
            <Mini label="Joined" value={docs.joined} />
            <Mini label="Verified, not joined yet" value={docs.awaitingJoining} />
            <Mini label="Joining in the next 30 days" value={docs.joiningNext30Days} />
            <Mini label="No joining date recorded" value={docs.noJoiningDate} />
            <Mini
              label="Joining date requests"
              value={docs.deferralsPending}
              warn={undefined}
              hint={`${docs.deferralsApproved} approved · ${docs.deferralsDeclined} declined`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Mini({ label, value, warn, hint }: { label: string; value: number; warn?: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
      {warn && <p className="text-[11px] text-rose-700 mt-0.5">{warn}</p>}
      {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
    </div>
  );
}
