import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePartner } from "@/lib/partner-auth";
import { partnerApplicationPaymentViewUrl } from "@/lib/partner-application-payment-upload";

export const dynamic = "force-dynamic";

/**
 * GET /api/partner/venues/[id]/applications/[applicationId]/payment-documents
 * Список документов об оплате по заявке (партнёр владеет площадкой).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; applicationId: string }> }
) {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  const { id: venueId, applicationId } = await context.params;
  const vid = venueId?.trim();
  const aid = applicationId?.trim();
  if (!vid || !aid) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  const venue = await prisma.partnerVenue.findFirst({
    where: { id: vid, partnerId },
    select: { id: true },
  });
  if (!venue) {
    return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
  }

  const application = await prisma.partnerVenueApplication.findFirst({
    where: { id: aid, partnerVenueId: venue.id },
    select: {
      id: true,
      paymentConfirmedAt: true,
      paymentDocuments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          storedFileName: true,
          originalFileName: true,
          createdAt: true,
        },
      },
    },
  });
  if (!application) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }

  const documents = application.paymentDocuments.map((d) => ({
    id: d.id,
    originalFileName: d.originalFileName,
    storedFileName: d.storedFileName,
    createdAt: d.createdAt.toISOString(),
    viewUrl: partnerApplicationPaymentViewUrl(application.id, d.storedFileName),
  }));

  return NextResponse.json({
    paymentConfirmedAt: application.paymentConfirmedAt?.toISOString() ?? null,
    documents,
  });
}
