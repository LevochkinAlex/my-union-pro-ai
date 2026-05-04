import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { partnerApplicationPaymentUploadDir } from "@/lib/partner-application-payment-upload";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".rtf": "application/rtf",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
};

/**
 * GET — скачивание / просмотр документа об оплате (участник или партнёр площадки).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ applicationId: string; storedFileName: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { applicationId, storedFileName } = await context.params;
    const aid = applicationId?.trim();
    const stored = storedFileName?.trim();
    if (!aid || !stored || stored.includes("/") || stored.includes("..") || path.basename(stored) !== stored) {
      return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
    }

    const doc = await prisma.partnerVenueApplicationPaymentDocument.findFirst({
      where: {
        partnerVenueApplicationId: aid,
        storedFileName: stored,
      },
      select: {
        id: true,
        partnerVenueApplication: {
          select: {
            applicantUserId: true,
            partnerVenue: { select: { partnerId: true } },
          },
        },
      },
    });
    if (!doc) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }

    const uid = session.user.id;
    const isApplicant = doc.partnerVenueApplication.applicantUserId === uid;
    let isPartnerOwner = false;
    if (!isApplicant) {
      const venuePartnerId = doc.partnerVenueApplication.partnerVenue.partnerId;
      const partnerUser = await prisma.user.findFirst({
        where: { id: uid, partnerRecordId: venuePartnerId },
        select: { id: true },
      });
      isPartnerOwner = Boolean(partnerUser);
    }
    if (!isApplicant && !isPartnerOwner) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const localPath = path.join(partnerApplicationPaymentUploadDir(aid), stored);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(localPath);
    } catch {
      return NextResponse.json({ error: "Файл не найден на сервере" }, { status: 404 });
    }

    const ext = path.extname(stored).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[GET uploads/partner-application-payment]", e);
    return NextResponse.json({ error: "Ошибка чтения файла" }, { status: 500 });
  }
}
