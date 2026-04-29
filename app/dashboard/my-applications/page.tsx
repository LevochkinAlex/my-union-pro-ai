import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import PartnerVenueApplicationsList from "@/components/partner/PartnerVenueApplicationsList";

export const dynamic = "force-dynamic";

export default async function MyApplicationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="w-full max-w-full space-y-6 pb-8 md:space-y-8 md:pb-12">
      <PageHeader
        title="Мои заявки"
        description="Площадки партнёров, на участие в которых вы подали заявку."
      />
      <PartnerVenueApplicationsList apiUrl="/api/partner-venues/my-applications" variant="member" />
    </div>
  );
}
