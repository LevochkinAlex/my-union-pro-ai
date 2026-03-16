/**
 * POST /api/ppo-head/meetings/[id]/resolutions/create
 * Создаёт отдельное постановление по каждому утверждённому вопросу повестки (по шаблону постановления профкома).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { DocumentType, DocumentStatus, DocumentCategory } from "@prisma/client";
import { generatePDFFromHTML } from "@/lib/document-templates/renderer";
import { updateResolutionCopiesInInbox } from "@/lib/meeting-agenda-notify";

function escapeHtml(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatUserName(user: { lastName: string | null; firstName: string | null; middleName?: string | null } | null): string {
  if (!user) return "";
  return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ");
}

/** Номер постановления в виде 02-01 (две цифры — две цифры) */
function formatResolutionNumber(meetingNumber: string | null, orderNumber: number): string {
  return `${String(meetingNumber ?? "0").padStart(2, "0")}-${String(orderNumber).padStart(2, "0")}`;
}

/** ФИО в формате «Фамилия И.О.» */
function chairmanShortName(fullName: string | null | undefined): string {
  if (!fullName || !fullName.trim()) return "____________________";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return fullName.trim();
  const lastName = parts[0];
  const initials = parts.slice(1).map((p) => (p.charAt(0) || "") + ".").join("");
  return `${lastName} ${initials}`.trim();
}

/** Генерация HTML постановления по одному пункту повестки (шаблон по образцу 4_Постановление_профсоюзного_комитета) */
function buildResolutionHTML(params: {
  organizationName: string;
  resolutionNumber: string;
  meetingDate: string;
  protocolNumber: string;
  itemTitle: string;
  itemHeardText: string;
  speakerName: string;
  resolutionText: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstained: number;
  chairmanName: string;
  secretaryName: string;
}): string {
  const {
    organizationName,
    resolutionNumber,
    meetingDate,
    protocolNumber,
    itemTitle,
    itemHeardText,
    speakerName,
    resolutionText,
    votesFor,
    votesAgainst,
    votesAbstained,
    chairmanName,
    secretaryName,
  } = params;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.6; margin: 0; padding: 40px 50px; color: #000; }
    .header-org { text-align: center; margin-bottom: 16px; }
    .header-org .line1 { font-size: 14px; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-org .line2 { font-size: 14px; margin: 2px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-org .line3 { font-size: 14px; font-weight: bold; margin: 14px 0 0 0; }
    .header-org .line4 { font-size: 14px; margin: 4px 0 0 0; }
    .header-org .line5 { font-size: 14px; margin: 4px 0 0 0; }
    .header-org .line6 { font-size: 14px; font-weight: bold; margin: 20px 0 0 0; }
    .header-date-number { margin-top: 20px; display: flex; justify-content: space-between; width: 100%; font-size: 14px; font-weight: bold; }
    .meta-row { margin: 20px 0; }
    .theme { margin: 20px 0 10px 0; }
    .postanovlyaet { font-size: 16px; font-weight: bold; text-align: center; margin: 24px 0; }
    .votes { margin: 24px 0; padding: 16px 0; }
    .signatures { margin-top: 50px; }
    .sig-table { width: 100%; border-collapse: collapse; }
    .sig-table td { padding: 16px 0; vertical-align: bottom; width: 50%; }
    .sig-line { border-bottom: 1px solid #333; margin: 28px 0 6px 0; width: 85%; }
  </style>
</head>
<body>
  <div class="header-org">
    <p class="line1">ПРОФЕССИОНАЛЬНЫЙ СОЮЗ РАБОТНИКОВ ЗДРАВООХРАНЕНИЯ</p>
    <p class="line2">РОССИЙСКОЙ ФЕДЕРАЦИИ</p>
    <p class="line3">Профсоюзный комитет</p>
    <p class="line4">Первичной профсоюзной организации</p>
    <p class="line5">ГБУЗ МО «${escapeHtml(organizationName)}»</p>
    <p class="line6">Постановление</p>
  </div>
  <div class="header-date-number">
    <span>${meetingDate} г.</span>
    <span>№ ${escapeHtml(resolutionNumber)}</span>
  </div>

  <div class="theme">${escapeHtml(itemTitle)}</div>
  <div class="postanovlyaet">ПОСТАНОВЛЯЕТ:</div>
  <div style="margin: 16px 0; padding-left: 20px;">${escapeHtml(resolutionText || "—").replace(/\n/g, "<br>")}</div>

  <div class="votes">
    <p style="font-weight: bold; margin-bottom: 8px;">Результаты голосования:</p>
    <p style="margin: 4px 0;">«За» – ${votesFor}; «Против» – ${votesAgainst}; «Воздержались» – ${votesAbstained}</p>
  </div>

  <div class="signatures" style="margin-top: 50px; text-align: right;">
    <p style="margin: 0;">Председатель ППО &nbsp;&nbsp; ______________________________ &nbsp;&nbsp; ${escapeHtml(chairmanShortName(chairmanName))}</p>
  </div>
</body>
</html>
  `.trim();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const perm = await checkUserPermissions(session.user.id, "documents_create");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id: meetingId } = await params;
    const body = (await request.json().catch(() => ({}))) as { agendaApprovedItemIds?: string[]; regenerate?: boolean };

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        organization: { select: { id: true, name: true, chairmanName: true } },
        protocolDocument: { select: { id: true, regNumber: true } },
        agendaItems: {
          include: {
            speaker: { select: { id: true, lastName: true, firstName: true, middleName: true } },
          },
          orderBy: { orderNumber: "asc" },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }
    if (meeting.organizationId !== perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }
    if (!meeting.protocolDocument?.id) {
      return NextResponse.json({ error: "Сначала сформируйте протокол заседания" }, { status: 400 });
    }

    const protocolNumber = meeting.protocolDocument.regNumber || meeting.number || "—";
    const meetingDate = formatDate(meeting.scheduledDate);
    const chairmanName = meeting.organization.chairmanName || "";
    const secretaryForMeeting = await prisma.meetingParticipant.findFirst({
      where: { meetingId, role: "SECRETARY" },
      include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
    });
    const secretaryName = secretaryForMeeting?.user ? formatUserName(secretaryForMeeting.user) : "";

    if (body.regenerate === true) {
      const existingResolutions = await prisma.document.findMany({
        where: { type: DocumentType.RESOLUTION, meetingResolutionId: meetingId },
        select: { id: true, regNumber: true, metadata: true },
      });
      const agendaItemsById = new Map(meeting.agendaItems.map((i) => [i.id, i]));
      let regenerated = 0;
      const fs = await import("fs/promises");
      const path = await import("path");
      const publicDir = path.join(process.cwd(), "public", "generated-documents");
      await fs.mkdir(publicDir, { recursive: true });
      for (const doc of existingResolutions) {
        const meta = doc.metadata as { agendaItemId?: string } | null;
        const agendaItemId = meta?.agendaItemId;
        if (!agendaItemId) continue;
        const item = agendaItemsById.get(agendaItemId);
        if (!item) continue;
        const speakerName = item.speakerName || (item.speaker ? formatUserName(item.speaker) : "");
        const html = buildResolutionHTML({
          organizationName: meeting.organization.name,
          resolutionNumber: formatResolutionNumber(meeting.number, item.orderNumber),
          meetingDate,
          protocolNumber,
          itemTitle: item.title,
          itemHeardText: item.heardText || item.title,
          speakerName,
          resolutionText: item.resolutionText || "",
          votesFor: item.votesFor ?? 0,
          votesAgainst: item.votesAgainst ?? 0,
          votesAbstained: item.votesAbstained ?? 0,
          chairmanName,
          secretaryName,
        });
        const pdfBuffer = await generatePDFFromHTML(html);
        if (!pdfBuffer?.length) continue;
        const fileName = `resolution_${meetingId}_${agendaItemId}_${Date.now()}.pdf`;
        const fullPath = path.join(publicDir, fileName);
        await fs.writeFile(fullPath, pdfBuffer);
        const filePath = `/generated-documents/${fileName}`;
        const newRegNumber = formatResolutionNumber(meeting.number, item.orderNumber);
        await prisma.document.update({
          where: { id: doc.id },
          data: { filePath, fileName, regNumber: newRegNumber, updatedAt: new Date() },
        });
        await updateResolutionCopiesInInbox([{ id: doc.id, filePath, fileName }]);
        regenerated += 1;
      }
      const updatedMeeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
          organization: { select: { id: true, name: true, chairmanName: true, chairmanJobTitle: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
          agendaDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
          protocolDocument: { select: { id: true, regNumber: true, status: true, filePath: true, signedFilePath: true, title: true, createdAt: true } },
          resolutions: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, metadata: true } },
          extracts: { select: { id: true, regNumber: true, status: true, filePath: true, title: true } },
          participants: { include: { user: { select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true, email: true } } }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] },
          agendaItems: { include: { speaker: { select: { id: true, firstName: true, lastName: true, middleName: true } }, votes: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } }, orderBy: { orderNumber: "asc" } },
          groupChat: { select: { id: true, archivedAt: true } },
        },
      });
      return NextResponse.json({
        message: `Обновлено постановлений: ${regenerated}`,
        regenerated,
        meeting: updatedMeeting,
      });
    }

    const fromBody = body.agendaApprovedItemIds && Array.isArray(body.agendaApprovedItemIds) && body.agendaApprovedItemIds.length > 0;
    const procedural = (meeting as any).protocolProceduralData as { agendaApprovedItemIds?: string[] } | null;
    const approvedIds = fromBody
      ? new Set(body.agendaApprovedItemIds as string[])
      : procedural?.agendaApprovedItemIds && Array.isArray(procedural.agendaApprovedItemIds) && procedural.agendaApprovedItemIds.length > 0
        ? new Set(procedural.agendaApprovedItemIds as string[])
        : new Set(meeting.agendaItems.map((i) => i.id));
    const itemsToCreate = meeting.agendaItems.filter((item) => approvedIds.has(item.id));
    if (itemsToCreate.length === 0) {
      return NextResponse.json({ error: "Нет утверждённых пунктов повестки для постановлений" }, { status: 400 });
    }

    const year = meeting.scheduledDate.getFullYear();
    const existingResolutions = await prisma.document.findMany({
      where: {
        type: DocumentType.RESOLUTION,
        organizationId: meeting.organizationId,
        meetingResolutionId: meetingId,
      },
      select: { regNumber: true },
    });
    const existingRegNumbers = new Set(existingResolutions.map((d) => d.regNumber).filter(Boolean));
    let resolutionIndex = existingResolutions.length;

    const fs = await import("fs/promises");
    const path = await import("path");
    const publicDir = path.join(process.cwd(), "public", "generated-documents");
    await fs.mkdir(publicDir, { recursive: true });

    const created: { id: string; regNumber: string; title: string; agendaItemId: string }[] = [];

    for (const item of itemsToCreate) {
      const alreadyExists = await prisma.document.findFirst({
        where: {
          type: DocumentType.RESOLUTION,
          meetingResolutionId: meetingId,
          metadata: { path: ["agendaItemId"], equals: item.id },
        },
      });
      if (alreadyExists) continue;

      resolutionIndex += 1;
      const resolutionNumber = formatResolutionNumber(meeting.number, item.orderNumber);
      const speakerName = item.speakerName ||
        (item.speaker ? formatUserName(item.speaker) : "");

      const html = buildResolutionHTML({
        organizationName: meeting.organization.name,
        resolutionNumber,
        meetingDate,
        protocolNumber,
        itemTitle: item.title,
        itemHeardText: item.heardText || item.title,
        speakerName,
        resolutionText: item.resolutionText || "",
        votesFor: item.votesFor ?? 0,
        votesAgainst: item.votesAgainst ?? 0,
        votesAbstained: item.votesAbstained ?? 0,
        chairmanName,
        secretaryName,
      });

      const pdfBuffer = await generatePDFFromHTML(html);
      if (!pdfBuffer?.length) {
        console.error(`[resolutions/create] Пустой PDF для пункта ${item.orderNumber}`);
        continue;
      }
      const fileName = `resolution_${meetingId}_${item.id}_${Date.now()}.pdf`;
      const fullPath = path.join(publicDir, fileName);
      await fs.writeFile(fullPath, pdfBuffer);
      const filePath = `/generated-documents/${fileName}`;

      const doc = await prisma.document.create({
        data: {
          type: DocumentType.RESOLUTION,
          status: DocumentStatus.DRAFT,
          category: DocumentCategory.INTERNAL,
          title: `Постановление по вопросу ${item.orderNumber}: ${item.title}`,
          regNumber: resolutionNumber,
          regDate: new Date(),
          filePath,
          fileName,
          userId: session.user.id,
          organizationId: meeting.organizationId,
          meetingResolutionId: meetingId,
          metadata: {
            meetingId,
            agendaItemId: item.id,
            meetingNumber: meeting.number,
            orderNumber: item.orderNumber,
          },
        },
      });
      created.push({ id: doc.id, regNumber: doc.regNumber, title: doc.title, agendaItemId: item.id });
    }

    // Рассылка копий постановлений во «Входящие» участникам не выполняется (по требованию).
    // Не вызывать assignResolutionsToParticipantsAndNotify.

    const updatedMeeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        organization: { select: { id: true, name: true, chairmanName: true, chairmanJobTitle: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        agendaDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
        protocolDocument: { select: { id: true, regNumber: true, status: true, filePath: true, signedFilePath: true, title: true, createdAt: true } },
        resolutions: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, metadata: true } },
        extracts: { select: { id: true, regNumber: true, status: true, filePath: true, title: true } },
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true, email: true } } },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        },
        agendaItems: {
          include: { speaker: { select: { id: true, firstName: true, lastName: true, middleName: true } }, votes: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
          orderBy: { orderNumber: "asc" },
        },
        groupChat: { select: { id: true, archivedAt: true } },
      },
    });

    return NextResponse.json({
      message: created.length > 0 ? `Создано постановлений: ${created.length}` : "Постановления по выбранным вопросам уже созданы",
      created: created.length,
      resolutions: created,
      meeting: updatedMeeting,
    });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]/resolutions/create] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании постановлений",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
