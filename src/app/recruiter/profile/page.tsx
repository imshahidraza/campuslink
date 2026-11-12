import Link from "next/link";
import { requireRecruiterOrRedirect } from "@/lib/auth";
import { loadKeyPeople } from "@/lib/keyPeople";
import { KeyPeopleEditor } from "@/components/dashboard/KeyPeopleEditor";

export default async function RecruiterProfilePage() {
  const { recruiter } = await requireRecruiterOrRedirect();
  const people = await loadKeyPeople(recruiter.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Company Profile</h1>
      <p className="text-muted text-sm mt-1">
        Show the people behind {recruiter.companyName}: add up to 3, such as your CEO, HR head or CFO. The placement
        cell can see them, and students see them once your account is approved. Your company details are in{" "}
        <Link href="/recruiter/profile-setup" className="text-blue-600 underline underline-offset-2 hover:text-blue-800">
          Profile setup
        </Link>
        .
      </p>

      <div className="mt-8">
        <KeyPeopleEditor people={people} />
      </div>
    </div>
  );
}
