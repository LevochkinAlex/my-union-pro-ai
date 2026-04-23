import { prisma, withPrismaRetry } from "@/lib/prisma";
import { partnerListPrismaErrorToUserMessage } from "@/lib/prisma-partner-list-error-message";
import PartnersPageClient, { type PartnerRow } from "./PartnersPageClient";

const PAGE_SIZE = 20;

export const dynamic = "force-dynamic";

export default async function AdminPartnersPage() {
  let initialPartners: PartnerRow[] = [];
  let initialTotal = 0;
  let serverError: string | null = null;

  try {
    const [partners, total] = await withPrismaRetry(() =>
      Promise.all([
        prisma.partner.findMany({
          orderBy: [
            { liquidationAutoBlockedAt: { sort: "desc", nulls: "last" } },
            { createdAt: "desc" },
          ],
          take: PAGE_SIZE,
          skip: 0,
          include: {
            linkedUser: { select: { id: true, email: true } },
            cabinetUser: { select: { id: true, email: true } },
          },
        }),
        prisma.partner.count(),
      ])
    );
    initialPartners = JSON.parse(JSON.stringify(partners)) as PartnerRow[];
    initialTotal = total;
  } catch (e) {
    console.error("[admin/partners] Prisma:", e);
    serverError = partnerListPrismaErrorToUserMessage(
      e,
      "Не удалось подключиться к базе данных. Проверьте сеть и DATABASE_URL. Список можно обновить позже."
    );
  }

  return (
    <PartnersPageClient
      initialPartners={initialPartners}
      initialTotal={initialTotal}
      serverError={serverError}
    />
  );
}
