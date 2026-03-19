/**
 * POST /api/ppo-head/meetings/[id]/extracts/create
 * Создаёт выписку из протокола заседания (документ типа PROTOCOL_EXTRACT).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { DocumentType, DocumentStatus, DocumentCategory } from "@prisma/client";
import { generatePDFFromHTML } from "@/lib/document-templates/renderer";

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

/** Один пункт выписки (вопрос из протокола) */
type ExtractItem = {
  title: string;
  heardText: string;
  speakerName: string;
  resolutionText: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstained: number;
};

function buildExtractHTML(params: {
  organizationName: string;
  regNumber: string;
  meetingDate: string;
  protocolNumber: string;
  location: string;
  meetingTime: string;
  allMembersList: string[];
  presentMembersList: string[];
  invitedGuestsList: string[];
  organizationChairmanName: string;
  secretaryName: string;
  items: ExtractItem[];
  currentDate: string;
}): string {
  const {
    organizationName,
    regNumber,
    meetingDate,
    protocolNumber,
    location,
    meetingTime,
    allMembersList,
    presentMembersList,
    invitedGuestsList,
    organizationChairmanName,
    secretaryName,
    items,
    currentDate,
  } = params;
  const allCount = allMembersList.length;
  const presentCount = presentMembersList.length;
  const allNumbered = allMembersList.map((name, i) => `${i + 1}. ${escapeHtml(name)}`).join("\n");
  const presentNumbered = presentMembersList.map((name, i) => `${i + 1}. ${escapeHtml(name)}`).join("\n");
  const invitedNumbered = invitedGuestsList.length
    ? invitedGuestsList.map((name, i) => `${i + 1}. ${escapeHtml(name)}`).join("\n")
    : "";

  const voteResult = (vFor: number, vAgainst: number, vAbs: number) => {
    const total = vFor + vAgainst + vAbs;
    if (total === 0) return "Не голосовали.";
    if (vAgainst === 0 && vAbs === 0) return "Решение принято единогласно.";
    return "Решение принято большинством голосов.";
  };

  const blocksHtml = items
    .map(
      (item) => `
  <div class="extract-block" style="margin: 24px 0;">
    <p style="margin: 8px 0;"><strong>СЛУШАЛИ:</strong> ${escapeHtml(item.heardText || item.title)}.</p>
    <p style="margin: 8px 0;">Докладывал ${escapeHtml(item.speakerName || "____________________")}.</p>
    <p style="margin: 8px 0;"><strong>ПОСТАНОВИЛИ:</strong></p>
    <p style="margin: 8px 0; padding-left: 20px;">${escapeHtml(item.resolutionText || "—").replace(/\n/g, "<br>")}</p>
    <p style="margin: 8px 0;">Голосовали:</p>
    <p style="margin: 4px 0;">«За» – ${item.votesFor}; «Против» – ${item.votesAgainst}; «Воздержались» – ${item.votesAbstained}</p>
    <p style="margin: 4px 0;"><em>${voteResult(item.votesFor, item.votesAgainst, item.votesAbstained)}</em></p>
  </div>`
    )
    .join("");

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
    .header-org .line6 { font-size: 16px; font-weight: bold; margin: 20px 0 4px 0; text-align: center; }
    .header-org .line7 { font-size: 14px; font-weight: bold; margin: 0; text-align: center; }
    .meta-row { margin: 10px 0; }
    .extract-block { margin: 24px 0; page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  <div class="header-org">
    <p class="line1">ПРОФЕССИОНАЛЬНЫЙ СОЮЗ РАБОТНИКОВ ЗДРАВООХРАНЕНИЯ</p>
    <p class="line2">РОССИЙСКОЙ ФЕДЕРАЦИИ</p>
    <p class="line3">Профсоюзный комитет</p>
    <p class="line4">Первичной профсоюзной организации</p>
    <p class="line5">ГБУЗ МО «${escapeHtml(organizationName)}»</p>
    <p class="line6">ВЫПИСКА ИЗ ПРОТОКОЛА № ${escapeHtml(regNumber)}</p>
    <p class="line7">от ${escapeHtml(meetingDate)} г.</p>
  </div>
  <p class="meta-row">Место проведения: ${escapeHtml(location || "—")}</p>
  <p class="meta-row">Начало заседания: ${escapeHtml(meetingTime || "—")}</p>
  <p class="meta-row">В состав профкома избраны: ${allCount} чел.</p>
  <div class="meta-list">${allNumbered.split("\n").map((line) => `<p class="meta-row" style="margin: 2px 0; padding-left: 20px;">${line}</p>`).join("")}</div>
  <p class="meta-row">Присутствовали на заседании: ${presentCount} чел.</p>
  <div class="meta-list">${presentNumbered.split("\n").map((line) => `<p class="meta-row" style="margin: 2px 0; padding-left: 20px;">${line}</p>`).join("")}</div>
  ${invitedNumbered ? `<p class="meta-row">Присутствовали приглашенные:</p><div class="meta-list">${invitedNumbered.split("\n").map((line) => `<p class="meta-row" style="margin: 2px 0; padding-left: 20px;">${line}</p>`).join("")}</div>` : ""}
  <p class="meta-row">В соответствии с п.3 ст. 18 Устава Профсоюза заседание профсоюзного комитета считается правомочным (имеет кворум) и объявляется открытым.</p>
  ${blocksHtml}
  <div style="margin-top: 50px; page-break-inside: avoid; break-inside: avoid;">
    <p style="margin: 0; text-align: left;">«ВЕРНО»</p>
    <p style="margin: 1em 0 0 0; text-align: right;">Председатель ППО &nbsp;&nbsp; ______________________________ &nbsp;&nbsp; ${escapeHtml(organizationChairmanName)}</p>
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
    const body = (await request.json().catch(() => ({}))) as {
      agendaItemIds?: string[];
      invitedGuests?: string | null;
      location?: string | null;
      meetingTime?: string | null;
    };
    const agendaItemIds = Array.isArray(body.agendaItemIds) ? body.agendaItemIds : undefined;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        organizationId: true,
        scheduledDate: true,
        scheduledTime: true,
        location: true,
        number: true,
        invitedGuests: true,
        organization: { select: { id: true, name: true, chairmanName: true } },
        protocolDocument: { select: { id: true, regNumber: true } },
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, middleName: true } },
          },
        },
        agendaItems: {
          include: {
            speaker: { select: { id: true, firstName: true, lastName: true, middleName: true } },
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
    const canDeleteMeeting =
      perm.isChairman || (!!perm.roleName && /зам|заместитель/i.test(perm.roleName));
    if (!canDeleteMeeting) {
      return NextResponse.json(
        { error: "Создавать выписки могут только председатель и заместитель председателя" },
        { status: 403 }
      );
    }
    if (!meeting.protocolDocument?.id) {
      return NextResponse.json({ error: "Сначала сформируйте протокол заседания" }, { status: 400 });
    }

    const protocolNumber = meeting.protocolDocument.regNumber || meeting.number || "—";
    const meetingDate = formatDate(meeting.scheduledDate);
    const presentParticipants = meeting.participants.filter((p: { attendance: string }) =>
      ["PRESENT", "PRESENT_OFFLINE", "PRESENT_ONLINE"].includes(p.attendance)
    );
    const presentMembersList = presentParticipants
      .map((p: { user?: { lastName: string; firstName: string; middleName?: string | null } | null; externalName?: string }) =>
        p.user ? formatUserName(p.user) : (p as { externalName?: string }).externalName || ""
      )
      .filter(Boolean) as string[];
    const votingParticipants = meeting.participants.filter((p: { canVote?: boolean }) => p.canVote !== false);
    const allMembersList = votingParticipants
      .map((p: { user?: { lastName: string; firstName: string; middleName?: string | null } | null; externalName?: string }) =>
        p.user ? formatUserName(p.user) : (p as { externalName?: string }).externalName || ""
      )
      .filter(Boolean) as string[];
    const location = body.location !== undefined && body.location !== null ? String(body.location).trim() : (meeting.location ?? "");
    const meetingTime = body.meetingTime !== undefined && body.meetingTime !== null ? String(body.meetingTime).trim() : (meeting.scheduledTime ?? "");
    const invitedGuestsRaw = body.invitedGuests !== undefined && body.invitedGuests !== null ? String(body.invitedGuests).trim() : (meeting.invitedGuests ?? "");
    const invitedGuestsList = invitedGuestsRaw
      ? invitedGuestsRaw
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const organizationChairmanName = meeting.organization.chairmanName || "";

    const secretaryParticipant = await prisma.meetingParticipant.findFirst({
      where: { meetingId, role: "SECRETARY" },
      include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
    });
    const secretaryName = secretaryParticipant?.user ? formatUserName(secretaryParticipant.user) : "";

    const agendaItems = meeting.agendaItems as Array<{
      id: string;
      orderNumber: number;
      title: string;
      heardText: string | null;
      resolutionText: string | null;
      decidedText: string | null;
      votesFor: number;
      votesAgainst: number;
      votesAbstained: number;
      speaker?: { lastName: string | null; firstName: string | null; middleName: string | null } | null;
      speakerName: string | null;
    }>;
    const selectedIds = agendaItemIds?.length ? new Set(agendaItemIds) : new Set(agendaItems.map((a) => a.id));
    const selectedItems = agendaItems.filter((a) => selectedIds.has(a.id)).sort((a, b) => a.orderNumber - b.orderNumber);
    const requestedItemIds = selectedItems.map((a) => a.id).sort();

    const existingExtracts = await prisma.document.findMany({
      where: { type: DocumentType.PROTOCOL_EXTRACT, meetingExtractId: meetingId },
      select: { id: true, regNumber: true, metadata: true },
    });
    const sameAgendaSet = (a: string[], b: string[]) =>
      a.length === b.length && a.every((id, i) => id === b[i]);
    const duplicate = existingExtracts.find((ex) => {
      const meta = ex.metadata as { agendaItemIds?: string[] } | null;
      const existingIds = Array.isArray(meta?.agendaItemIds) ? [...meta.agendaItemIds].sort() : [];
      return sameAgendaSet(requestedItemIds, existingIds);
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `Выписка с таким набором вопросов уже существует (${duplicate.regNumber || "выписка"}). Новая выписка не создана.`,
        },
        { status: 400 }
      );
    }

    const nextIndex = existingExtracts.length + 1;
    const regNumber = `ВП-${String(nextIndex).padStart(2, "0")}`;

    const extractItems: ExtractItem[] = selectedItems.map((item) => ({
      title: item.title,
      heardText: item.heardText || item.title,
      speakerName: item.speaker
        ? [item.speaker.lastName, item.speaker.firstName, item.speaker.middleName].filter(Boolean).join(" ")
        : item.speakerName || "",
      resolutionText: item.resolutionText || item.decidedText || "",
      votesFor: item.votesFor ?? 0,
      votesAgainst: item.votesAgainst ?? 0,
      votesAbstained: item.votesAbstained ?? 0,
    }));

    if (extractItems.length === 0) {
      return NextResponse.json(
        { error: "Выберите хотя бы один вопрос повестки для выписки" },
        { status: 400 }
      );
    }

    const html = buildExtractHTML({
      organizationName: meeting.organization.name,
      regNumber,
      meetingDate,
      protocolNumber,
      location: location || "",
      meetingTime: meetingTime || "",
      allMembersList: allMembersList.length ? allMembersList : ["—"],
      presentMembersList: presentMembersList.length ? presentMembersList : ["—"],
      invitedGuestsList,
      organizationChairmanName: organizationChairmanName || "—",
      secretaryName: secretaryName || "—",
      items: extractItems,
      currentDate: formatDate(new Date()),
    });

    const pdfBuffer = await generatePDFFromHTML(html);
    if (!pdfBuffer?.length) {
      return NextResponse.json({ error: "Не удалось сформировать PDF выписки" }, { status: 500 });
    }

    const fs = await import("fs/promises");
    const path = await import("path");
    const publicDir = path.join(process.cwd(), "public", "generated-documents");
    await fs.mkdir(publicDir, { recursive: true });
    const fileName = `extract_${meetingId}_${Date.now()}.pdf`;
    const fullPath = path.join(publicDir, fileName);
    await fs.writeFile(fullPath, pdfBuffer);
    const filePath = `/generated-documents/${fileName}`;

    await prisma.document.create({
      data: {
        type: DocumentType.PROTOCOL_EXTRACT,
        status: DocumentStatus.DRAFT,
        category: DocumentCategory.INTERNAL,
        title: `Выписка из протокола № ${protocolNumber} от ${meetingDate}`,
        regNumber,
        regDate: new Date(),
        filePath,
        fileName,
        userId: session.user.id,
        organizationId: meeting.organizationId,
        meetingExtractId: meetingId,
        metadata: { meetingId, agendaItemIds: selectedItems.map((i) => i.id) },
      },
    });

    // Сохраняем переданные данные в заседании, чтобы следующие выписки и карточка заседания были корректны
    const meetingUpdateData: { location?: string | null; scheduledTime?: string | null; invitedGuests?: string | null } = {};
    if (body.location !== undefined) meetingUpdateData.location = body.location === null || body.location === "" ? null : String(body.location).trim();
    if (body.meetingTime !== undefined) meetingUpdateData.scheduledTime = body.meetingTime === null || body.meetingTime === "" ? null : String(body.meetingTime).trim();
    if (body.invitedGuests !== undefined) meetingUpdateData.invitedGuests = body.invitedGuests === null || body.invitedGuests === "" ? null : String(body.invitedGuests).trim();
    if (Object.keys(meetingUpdateData).length > 0) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: meetingUpdateData,
      });
    }

    const updatedMeeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        organization: { select: { id: true, name: true, chairmanName: true, chairmanJobTitle: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        agendaDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
        protocolDocument: { select: { id: true, regNumber: true, status: true, filePath: true, signedFilePath: true, title: true, createdAt: true } },
        resolutions: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, metadata: true } },
        extracts: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, metadata: true } },
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
      message: "Выписка создана",
      meeting: updatedMeeting,
    });
  } catch (error: unknown) {
    console.error("[ppo-head/meetings/[id]/extracts/create] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании выписки",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
