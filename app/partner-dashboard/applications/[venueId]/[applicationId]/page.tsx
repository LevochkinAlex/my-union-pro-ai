import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PV_APPLICATION_STATUS } from "@/lib/partner-venue-application-status";
import { prisma } from "@/lib/prisma";
import PartnerApplicationAttachmentZone from "@/components/partner/PartnerApplicationAttachmentZone";
import PartnerApplicationOpenedBeacon from "@/components/partner/PartnerApplicationOpenedBeacon";
import PartnerApplicationStubActions from "@/components/partner/PartnerApplicationStubActions";

type PageProps = {
  params: Promise<{ venueId: string; applicationId: string }>;
};

/** Страница заявки участника (карточка — в разработке). */
export default async function PartnerVenueApplicationStubPage({ params }: PageProps) {
  const { venueId, applicationId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      partnerRecordId: true,
      partnerRecord: { select: { moderationStatus: true } },
    },
  });

  if (
    !user ||
    user.role !== "PARTNER" ||
    !user.partnerRecordId ||
    user.partnerRecord?.moderationStatus === "BLOCKED"
  ) {
    notFound();
  }

  const partnerId = user.partnerRecordId;

  const vid = venueId.trim();
  const aid = applicationId.trim();
  if (!vid || !aid) {
    notFound();
  }

  const venueOwned = await prisma.partnerVenue.findFirst({
    where: { id: vid, partnerId },
    select: { id: true },
  });
  if (!venueOwned) {
    notFound();
  }

  // Чтение/обновление статуса через SQL: в dev Prisma singleton иногда без поля `status` в типах where/updateMany.
  const initialRows = await prisma.$queryRaw<Array<{ status: string }>>(
    Prisma.sql`
      SELECT a.status::text AS status
      FROM "PartnerVenueApplication" a
      INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
      WHERE a.id = ${aid}
        AND a."partnerVenueId" = ${venueOwned.id}
        AND v."partnerId" = ${partnerId}
      LIMIT 1
    `
  );
  if (initialRows.length === 0) {
    notFound();
  }

  let displayStatus = initialRows[0]!.status;

  if (displayStatus === PV_APPLICATION_STATUS.NEW) {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "PartnerVenueApplication" a
        SET status = 'IN_PROGRESS'::"PartnerVenueApplicationStatus"
        FROM "PartnerVenue" v
        WHERE a.id = ${aid}
          AND a."partnerVenueId" = ${venueOwned.id}
          AND v.id = a."partnerVenueId"
          AND v."partnerId" = ${partnerId}
          AND a.status::text = 'NEW'
      `
    );
    const afterRows = await prisma.$queryRaw<Array<{ status: string }>>(
      Prisma.sql`
        SELECT status::text AS status
        FROM "PartnerVenueApplication"
        WHERE id = ${aid} AND "partnerVenueId" = ${venueOwned.id}
        LIMIT 1
      `
    );
    displayStatus = afterRows[0]?.status ?? PV_APPLICATION_STATUS.IN_PROGRESS;
  }

  return (
    <div className="space-y-6">
      <PartnerApplicationOpenedBeacon />
      <div>
        <Link
          href={`/partner-dashboard/applications/${encodeURIComponent(vid)}`}
          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          ← К списку заявок по площадке
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Просмотр заявки</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Заявка <span className="font-mono text-xs">{aid}</span>
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-8 text-center dark:border-gray-600 dark:bg-gray-800/50">
        <div className="flex flex-col gap-8">
          <PartnerApplicationAttachmentZone />
          <PartnerApplicationStubActions
            venueId={vid}
            applicationId={aid}
            initialStatus={displayStatus}
          />
        </div>
      </div>
    </div>
  );
}
