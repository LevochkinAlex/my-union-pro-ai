import Link from "next/link";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { partnerApplicationPaymentViewUrl } from "@/lib/partner-application-payment-upload";
import MemberPartnerApplicationDocumentsPanel from "@/components/partner/MemberPartnerApplicationDocumentsPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string; applicationId: string }>;
};

/** Просмотр своей заявки на площадку (как у партнёра, без действий «Одобрить» / отклонения и т.д.). */
export default async function MemberPartnerVenueApplicationPage({ params }: PageProps) {
  const { id: venueId, applicationId } = await params;
  const vid = venueId.trim();
  const aid = applicationId.trim();
  if (!vid || !aid) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const application = await prisma.partnerVenueApplication.findFirst({
    where: {
      id: aid,
      partnerVenueId: vid,
      applicantUserId: session.user.id,
    },
    select: { id: true, status: true },
  });

  if (!application) {
    notFound();
  }

  let initialPaymentDocuments: Array<{
    id: string;
    originalFileName: string;
    viewUrl: string;
    createdAt: string;
  }> = [];
  try {
    const paymentRows = await prisma.partnerVenueApplicationPaymentDocument.findMany({
      where: { partnerVenueApplicationId: application.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        storedFileName: true,
        originalFileName: true,
        createdAt: true,
      },
    });
    initialPaymentDocuments = paymentRows.map((d) => ({
      id: d.id,
      originalFileName: d.originalFileName,
      viewUrl: partnerApplicationPaymentViewUrl(application.id, d.storedFileName),
      createdAt: d.createdAt.toISOString(),
    }));
  } catch (e) {
    console.warn(
      "[MemberPartnerVenueApplicationPage] Список документов об оплате недоступен (выполните `npx prisma migrate deploy` и `npx prisma generate`, перезапустите dev-сервер):",
      e
    );
  }

  const displayStatus = application.status;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 pb-8 md:space-y-8 md:pb-12">
      <div>
        <Link href="/dashboard/my-applications" className={backNavLinkButtonClass}>
          ← К моим заявкам
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Просмотр заявки</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Заявка <span className="font-mono text-xs">{aid}</span>
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-8 text-center dark:border-gray-600 dark:bg-gray-800/50">
        <MemberPartnerApplicationDocumentsPanel
          venueId={vid}
          applicationId={aid}
          initialStatus={displayStatus}
          initialPaymentDocuments={initialPaymentDocuments}
        />
      </div>
    </div>
  );
}
