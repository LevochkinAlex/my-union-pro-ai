import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { DocumentType, DocumentStatus, DocumentCategory } from "@prisma/client";
import { generatePDFFromHTML } from "@/lib/document-templates/renderer";
import { assignAgendaToParticipantsAndNotify } from "@/lib/meeting-agenda-notify";

// Форматирование даты в русском формате
function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * POST /api/ppo-head/meetings/[id]/generate-document
 * Генерация документа из заседания (повестка или протокол)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { documentType, approve, regNumber: regNumberOverride } = body; // documentType: "AGENDA" | "PROTOCOL"; approve: true — сразу утвердить; regNumber — необязательный свой номер документа

    if (!documentType || !["AGENDA", "PROTOCOL"].includes(documentType)) {
      return NextResponse.json(
        { error: "Укажите тип документа: AGENDA или PROTOCOL" },
        { status: 400 }
      );
    }

    // Получение заседания с полной информацией
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        organization: {
          select: { 
            id: true, 
            name: true, 
            chairmanName: true, 
            chairmanJobTitle: true,
            inn: true,
          },
        },
        participants: {
          include: {
            user: {
              select: { 
                id: true, 
                firstName: true, 
                lastName: true, 
                middleName: true, 
                jobTitle: true,
              },
            },
          },
          orderBy: { role: "asc" },
        },
        agendaItems: {
          include: {
            speaker: {
              select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true },
            },
            coSpeaker: {
              select: { id: true, firstName: true, lastName: true, middleName: true },
            },
            votes: true,
          },
          orderBy: { orderNumber: "asc" },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    if (meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    // Проверка кворума для протокола (50% + 1 от числа членов Профкома с правом голоса)
    if (documentType === "PROTOCOL") {
      const PRESENT_STATUSES = ["PRESENT", "PRESENT_OFFLINE", "PRESENT_ONLINE"];
      const votingMembers = meeting.participants.filter((p: any) => p.canVote);
      const totalEligible = votingMembers.length;
      const presentVoters = votingMembers.filter((p: any) => PRESENT_STATUSES.includes(p.attendance)).length;
      const quorumRequired = Math.floor(totalEligible / 2) + 1;
      if (totalEligible === 0 || presentVoters < quorumRequired) {
        return NextResponse.json(
          { error: `Кворум отсутствует: присутствуют ${presentVoters} из ${totalEligible} членов Профкома. Для правомочности заседания необходимо не менее ${quorumRequired}. Протокол не может быть сформирован.` },
          { status: 400 }
        );
      }
    }

    // Для протокола: если уже есть документ — обновляем его (тот же номер)
    const existingProtocolDoc = documentType === "PROTOCOL" && meeting.protocolDocumentId
      ? await prisma.document.findUnique({ where: { id: meeting.protocolDocumentId } })
      : null;

    // Для повестки: если уже есть документ — обновляем его при пересоздании (тот же номер)
    const existingAgendaDoc = documentType === "AGENDA" && meeting.agendaDocumentId
      ? await prisma.document.findUnique({ where: { id: meeting.agendaDocumentId } })
      : null;

    const docPrefix = documentType === "AGENDA" ? "AG" : "PR";
    const year = meeting.scheduledDate.getFullYear();
    let regNumber: string;

    if (existingAgendaDoc?.regNumber) {
      regNumber = existingAgendaDoc.regNumber;
    } else if (existingProtocolDoc?.regNumber) {
      regNumber = existingProtocolDoc.regNumber;
    } else if (regNumberOverride && typeof regNumberOverride === "string" && regNumberOverride.trim()) {
      regNumber = regNumberOverride.trim();
    } else {
      const lastDoc = await prisma.document.findFirst({
        where: {
          organizationId: meeting.organizationId,
          type: documentType as DocumentType,
          createdAt: {
            gte: new Date(year, 0, 1),
            lt: new Date(year + 1, 0, 1),
          },
        },
        orderBy: { regNumber: "desc" },
      });
      let nextNumber = 1;
      if (lastDoc?.regNumber) {
        const match = lastDoc.regNumber.match(/(\d+)/);
        if (match) nextNumber = parseInt(match[1]) + 1;
      }
      regNumber = `${docPrefix}${String(nextNumber).padStart(5, "0")}`;
    }

    const docDate = formatDate(meeting.scheduledDate);

    // ФИО в документы (повестка, протокол): участники заседания = выборный орган из «Управление сотрудниками»
    // (meeting.participants созданы при создании заседания из списка elected-body-members);
    // докладчики по пунктам — из item.speaker (User) или item.speakerName.
    const formatUserName = (user: any) => {
      if (!user) return "";
      return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ");
    };

    const chairman = meeting.participants.find(p => p.role === "CHAIRMAN");
    const secretary = meeting.participants.find(p => p.role === "SECRETARY");
    const presentStatuses = ["PRESENT", "PRESENT_OFFLINE", "PRESENT_ONLINE"];
    const presentMembers = meeting.participants.filter(p => presentStatuses.includes(p.attendance));
    const absentMembers = meeting.participants.filter(p => p.attendance === "ABSENT" || p.attendance === "EXCUSED");

    // Для протокола: подписывают Председательствующий и Секретарь (избранные на заседании — presidingOfficerUserId, secretaryUserId)
    let presidingOfficerName = "";
    let protocolSecretaryName = "";
    if (documentType === "PROTOCOL" && (meeting.presidingOfficerUserId || meeting.secretaryUserId)) {
      const userIds = [meeting.presidingOfficerUserId, meeting.secretaryUserId].filter(Boolean) as string[];
      const fromParticipants = userIds.map(uid => meeting.participants.find(p => p.userId === uid)?.user).filter(Boolean);
      const foundIds = new Set(fromParticipants.map((u: any) => u.id));
      const missingIds = userIds.filter(uid => !foundIds.has(uid));
      let extraUsers: Array<{ id: string; firstName: string | null; lastName: string | null; middleName: string | null }> = [];
      if (missingIds.length > 0) {
        extraUsers = await prisma.user.findMany({
          where: { id: { in: missingIds } },
          select: { id: true, firstName: true, lastName: true, middleName: true },
        });
      }
      const allUsers = [
        ...fromParticipants,
        ...extraUsers,
      ] as Array<{ id: string; firstName: string | null; lastName: string | null; middleName: string | null }>;
      if (meeting.presidingOfficerUserId) {
        const u = allUsers.find((u: any) => u.id === meeting.presidingOfficerUserId);
        presidingOfficerName = u ? formatUserName(u) : "";
      }
      if (meeting.secretaryUserId) {
        const u = allUsers.find((u: any) => u.id === meeting.secretaryUserId);
        protocolSecretaryName = u ? formatUserName(u) : "";
      }
    }

    const eligibleVoters = meeting.participants.filter((p: any) => p.canVote);
    const totalEligible = eligibleVoters.length;
    const presentVotersCount = presentMembers.filter((p: any) => p.canVote).length;
    const quorumRequired = Math.floor(totalEligible / 2) + 1;

    const presentMembersList = presentMembers.map(p =>
      p.user ? formatUserName(p.user) : p.externalName || ""
    ).filter(Boolean);
    const absentMembersList = absentMembers.map(p =>
      p.user ? formatUserName(p.user) : p.externalName || ""
    ).filter(Boolean);

    const procedural = (meeting as any).protocolProceduralData || {};

    const resolveUserName = (userId: string | undefined) => {
      if (!userId) return "";
      const p = meeting.participants.find((p: any) => p.userId === userId);
      if (p?.user) return formatUserName(p.user);
      return "";
    };

    const voteCounterIds: string[] = (() => {
      const raw = (meeting as any).voteCounterUserIds;
      if (!raw) return [];
      try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return []; }
    })();
    const voteCounterNames = voteCounterIds.map(resolveUserName).filter(Boolean);

    const templateData = {
      organizationName: meeting.organization.name,
      organizationChairmanName: meeting.organization.chairmanName || formatUserName(chairman?.user),
      organizationChairmanJobTitle: meeting.organization.chairmanJobTitle || "Председатель профкома",
      meetingNumber: meeting.number || "1",
      meetingDate: docDate,
      meetingTime: meeting.scheduledTime || "",
      meetingPlace: meeting.location || "",
      regNumber,
      currentDate: formatDate(new Date()),

      chairmanName: documentType === "PROTOCOL" && presidingOfficerName ? presidingOfficerName : (formatUserName(chairman?.user) || meeting.organization.chairmanName || ""),
      secretaryName: documentType === "PROTOCOL" && protocolSecretaryName ? protocolSecretaryName : (formatUserName(secretary?.user) || ""),
      secretaryJobTitle: secretary?.user?.jobTitle || "Секретарь",
      signatureLabelChairman: documentType === "PROTOCOL" ? "Председательствующий" : "Председатель",

      presentMembersList,
      presentMembers: presentMembersList.join(", "),
      absentMembersList,
      absentMembers: absentMembersList.join(", "),
      invitedGuests: (meeting as any).invitedGuests || "",

      totalMembers: totalEligible,
      presentCount: presentVotersCount,
      quorumRequired,
      quorum: presentVotersCount >= quorumRequired ? "имеется" : "отсутствует",

      procedural,
      presidingOfficerName,
      protocolSecretaryName,
      voteCounterNames,
      chairmanReportName: resolveUserName(procedural.chairmanReportUserId),
      secretaryReportName: resolveUserName(procedural.secretaryReportUserId),
      voteCounterReportName: resolveUserName(procedural.voteCounterReportUserId),
    };

    // Генерация HTML в зависимости от типа документа
    let htmlContent = "";
    let documentTitle = "";

    if (documentType === "AGENDA") {
      documentTitle = `Повестка дня заседания профкома ${regNumber} от ${docDate}`;
      htmlContent = generateAgendaHTML(meeting, templateData);
    } else {
      documentTitle = `Протокол заседания профкома ${regNumber} от ${docDate}`;
      htmlContent = generateProtocolHTML(meeting, templateData);
    }

    // Генерация PDF
    let filePath: string | null = null;
    let pdfBuffer: Buffer | null = null;

    try {
      pdfBuffer = await generatePDFFromHTML(htmlContent);
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error("Генератор PDF вернул пустой результат");
      }
      const fileName = `${documentType.toLowerCase()}_${regNumber}_${Date.now()}.pdf`;
      const fs = await import("fs/promises");
      const path = await import("path");
      const publicDir = path.join(process.cwd(), "public", "generated-documents");
      await fs.mkdir(publicDir, { recursive: true });
      const fullPath = path.join(publicDir, fileName);
      await fs.writeFile(fullPath, pdfBuffer);
      filePath = `/generated-documents/${fileName}`;
    } catch (pdfError: any) {
      console.error("Ошибка генерации PDF:", pdfError);
      return NextResponse.json(
        {
          error: "Не удалось сформировать PDF документа",
          details: process.env.NODE_ENV === "development" ? (pdfError?.message || String(pdfError)) : undefined,
        },
        { status: 500 }
      );
    }

    const protocolStatus = documentType === "PROTOCOL" && approve === true
      ? DocumentStatus.COMPLETED
      : DocumentStatus.DRAFT;

    let document: { id: string; regNumber: string; status: string; filePath: string | null; [key: string]: any };

    if (existingAgendaDoc) {
      // Пересоздание повестки: обновляем существующий документ (новый контент и PDF)
      document = await prisma.document.update({
        where: { id: existingAgendaDoc.id },
        data: {
          title: documentTitle,
          content: htmlContent,
          filePath,
          fileName: filePath ? filePath.split("/").pop() : null,
          updatedAt: new Date(),
        },
      });
    } else if (existingProtocolDoc) {
      // Обновляем существующий протокол (перезаписываем PDF и контент, опционально утверждаем)
      document = await prisma.document.update({
        where: { id: existingProtocolDoc.id },
        data: {
          title: documentTitle,
          content: htmlContent,
          filePath,
          fileName: filePath ? filePath.split("/").pop() : null,
          status: protocolStatus,
          updatedAt: new Date(),
        },
      });
    } else {
      // Создание документа в БД
      document = await prisma.document.create({
        data: {
          type: documentType as DocumentType,
          status: documentType === "PROTOCOL" ? protocolStatus : DocumentStatus.DRAFT,
          category: DocumentCategory.INTERNAL,
          title: documentTitle,
          content: htmlContent,
          regNumber,
          regDate: new Date(),
          filePath,
          fileName: filePath ? filePath.split("/").pop() : null,
          userId: session.user.id,
          organizationId: meeting.organizationId,
          metadata: {
            meetingId: meeting.id,
            meetingNumber: meeting.number,
            meetingDate: meeting.scheduledDate.toISOString(),
          },
        },
      });
    }

    // Привязка документа к заседанию и рассылка участникам (только при создании повестки)
    if (documentType === "AGENDA" && !meeting.agendaDocumentId) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { agendaDocumentId: document.id },
      });
      const chairmanName = [orgHead.lastName, orgHead.firstName].filter(Boolean).join(" ") || "Председатель";
      try {
        const result = await assignAgendaToParticipantsAndNotify(meeting.id, session.user.id, chairmanName);
        console.log(`[generate-document] Повестка: назначено ${result.assignedCount} участникам, уведомлено ${result.notifiedCount}`);
      } catch (notifyErr) {
        console.error("[generate-document] Ошибка рассылки повестки участникам:", notifyErr);
        // Не падаем — документ создан; рассылку можно повторить кнопкой «Разослать на согласование» или «Отправить уведомления»
      }
    } else if (documentType === "PROTOCOL" && !existingProtocolDoc) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { protocolDocumentId: document.id },
      });
      const participantsWithUserId = meeting.participants.filter(p => p.user?.id && p.role !== "CHAIRMAN");
      if (participantsWithUserId.length > 0) {
        await prisma.document.update({
          where: { id: document.id },
          data: { assignedToId: participantsWithUserId[0].user!.id, assignedAt: new Date() },
        });
      }
    }

    // При утверждении протокола — статус заседания «Завершено»
    if (documentType === "PROTOCOL" && approve === true) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: "COMPLETED" },
      });
    }

    const message = existingAgendaDoc
      ? "Повестка дня пересоздана по текущим пунктам."
      : existingProtocolDoc
        ? (approve === true ? "Протокол обновлён и утверждён. Можно отправлять в печать." : "Протокол сохранён в черновики.")
        : (documentType === "PROTOCOL" && approve === true
          ? "Протокол создан и утверждён. Можно отправлять в печать."
          : `${documentType === "AGENDA" ? "Повестка" : "Протокол"} успешно сформирован(а).`);

    // Возвращаем обновлённое заседание с актуальными статусами документов для синхронизации UI
    const updatedMeeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, chairmanName: true, chairmanJobTitle: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        agendaDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
        protocolDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
        resolutions: { select: { id: true, regNumber: true, status: true, filePath: true, title: true } },
        extracts: { select: { id: true, regNumber: true, status: true, filePath: true, title: true } },
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true, email: true } } },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        },
        agendaItems: {
          include: {
            speaker: { select: { id: true, firstName: true, lastName: true, middleName: true } },
            votes: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
          },
          orderBy: { orderNumber: "asc" },
        },
      },
    });

    return NextResponse.json({ document, message, meeting: updatedMeeting });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]/generate-document] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при генерации документа",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

// Экранирование HTML для безопасной подстановки в PDF
function escapeHtml(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Генерация HTML для Повестки дня
function generateAgendaHTML(meeting: any, data: any): string {
  const agendaItemsHtml = meeting.agendaItems
    .map((item: any) => {
      const speakerText = item.speakerName || (item.speaker ? [item.speaker.lastName, item.speaker.firstName, item.speaker.middleName].filter(Boolean).join(" ") : "");
      const speakerPosition = (item.speakerPosition || (item.speaker?.jobTitle ?? "")).trim();
      const coSpeakerText = item.coSpeakerName || (item.coSpeaker ? [item.coSpeaker.lastName, item.coSpeaker.firstName, item.coSpeaker.middleName].filter(Boolean).join(" ") : "");
      const docladchikLine = speakerText ? (speakerPosition ? `Докладчик: ${escapeHtml(speakerText)}, ${escapeHtml(speakerPosition)}` : `Докладчик: ${escapeHtml(speakerText)}`) : "";
      return `
      <tr>
        <td style="width: 40px; text-align: center; vertical-align: top; padding: 8px;">${item.orderNumber}.</td>
        <td style="padding: 8px;">
          <strong>${escapeHtml(item.title)}</strong>
          ${item.description ? `<br><span style="color: #666;">${escapeHtml(item.description)}</span>` : ""}
          ${docladchikLine ? `<br><em>${docladchikLine}</em>` : ""}
          ${coSpeakerText ? `<br><em>Со-докладчик: ${escapeHtml(coSpeakerText)}</em>` : ""}
        </td>
      </tr>
    `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 20mm 15mm 20mm 30mm; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 14px;
      line-height: 1.6;
      margin: 0;
      padding: 40px 30px 40px 50px;
      color: #000;
    }
    .header { text-align: center; margin-bottom: 24px; }
    .header .org-name { font-size: 13px; margin-bottom: 16px; }
    .header .title { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .header .subtitle { font-size: 14px; margin-bottom: 2px; }
    .header .date-line { font-size: 14px; margin-top: 4px; }
    .info-row { margin: 6px 0; }
    .agenda-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .agenda-table td { border: 1px solid #333; }
    .signatures { margin-top: 50px; page-break-inside: avoid; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 40px; }
    .sig-block { width: 45%; }
    .sig-block .sig-line { border-bottom: 1px solid #000; margin-bottom: 4px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="org-name">${escapeHtml(data.organizationName)}</div>
    <div class="title">ПОВЕСТКА ДНЯ</div>
    <div class="subtitle">заседания профсоюзного комитета первичной профсоюзной организации</div>
    <div class="subtitle">«${escapeHtml(data.organizationName)}»</div>
    <div class="date-line">№ ${data.regNumber} от ${data.meetingDate}</div>
  </div>

  <p class="info-row"><strong>Время:</strong> ${data.meetingTime || "___:___"}</p>
  <p class="info-row"><strong>Место проведения:</strong> ${escapeHtml(data.meetingPlace) || "_________________________"}</p>

  <p style="margin-top: 20px;"><strong>Вопросы для обсуждения:</strong></p>

  <table class="agenda-table">
    <tbody>
      ${agendaItemsHtml}
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-row">
      <div class="sig-block">
        <div>Председатель:</div>
        <div class="sig-line"></div>
        <div>${escapeHtml(data.chairmanName || "_________________________")}</div>
      </div>
      <div class="sig-block">
        <div>Секретарь:</div>
        <div class="sig-line"></div>
        <div>${escapeHtml(data.secretaryName || "_________________________")}</div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Генерация HTML для Протокола по стандарту Минюст РФ / Устав Профсоюза.
function generateProtocolHTML(meeting: any, data: any): string {
  const proc = data.procedural || {};
  const vFor = (f: string) => proc[f] || 0;

  const getVoteResult = (votesFor: number, votesAgainst: number, votesAbstained: number) => {
    const total = votesFor + votesAgainst + votesAbstained;
    if (total === 0) return "Не голосовали";
    if (votesFor === data.presentCount && votesAgainst === 0 && votesAbstained === 0) return "Решение принято единогласно.";
    const required = Math.floor(data.presentCount / 2) + 1;
    if (votesFor >= required) return `Решение принято большинством голосов.`;
    return `Решение не принято.`;
  };

  const proceduralBlock = (
    title: string,
    listenedText: string,
    reporterName: string,
    resolvedText: string,
    vF: number, vA: number, vAbs: number,
  ) => `
    <div class="protocol-block">
      <p><strong>СЛУШАЛИ:</strong> ${escapeHtml(listenedText)}</p>
      <p>Докладывал ${escapeHtml(reporterName || "____________________")} – член Профсоюза.</p>
      <p><strong>ПОСТАНОВИЛИ:</strong> ${escapeHtml(resolvedText)}</p>
      <p>Голосовали:</p>
      <p class="vote-line">«За» – ${vF}; &nbsp; «Против» – ${vA}; &nbsp; «Воздержались» – ${vAbs}</p>
      <p><em>${getVoteResult(vF, vA, vAbs)}</em></p>
    </div>
  `;

  const agendaListHtml = meeting.agendaItems.map((item: any) =>
    `<p style="margin: 2px 0; padding-left: 20px;">${item.orderNumber}. ${escapeHtml(item.title)}</p>`
  ).join("");

  const agendaItemsHtml = meeting.agendaItems.map((item: any) => {
    const speakerName = item.speakerName ||
      (item.speaker ? [item.speaker.lastName, item.speaker.firstName, item.speaker.middleName].filter(Boolean).join(" ") : "");
    const positionText = (item.speakerPosition || (item.speaker?.jobTitle ?? "")).trim();
    const coSpeakerName = item.coSpeakerName ||
      (item.coSpeaker ? [item.coSpeaker.lastName, item.coSpeaker.firstName, item.coSpeaker.middleName].filter(Boolean).join(" ") : "");

    return `
      <div class="protocol-block">
        <p><strong>СЛУШАЛИ:</strong> ${escapeHtml(item.heardText || item.title)}</p>
        <p>Докладывал ${escapeHtml(speakerName || "____________________")}${positionText ? `, ${escapeHtml(positionText)}` : ""}.</p>
        ${coSpeakerName ? `<p>Со-докладчик: ${escapeHtml(coSpeakerName)}</p>` : ""}
        <p><strong>ПОСТАНОВИЛИ:</strong> ${escapeHtml(item.resolutionText || "____________________")}</p>
        <p>Голосовали:</p>
        <p class="vote-line">«За» – ${item.votesFor || 0}; &nbsp; «Против» – ${item.votesAgainst || 0}; &nbsp; «Воздержались» – ${item.votesAbstained || 0}</p>
        <p><em>${getVoteResult(item.votesFor || 0, item.votesAgainst || 0, item.votesAbstained || 0)}</em></p>
      </div>
    `;
  }).join("");

  const presentMemberLines = (data.presentMembersList || []).map((name: string, i: number) =>
    `${i + 1}. ${escapeHtml(name)}`
  ).join("<br>");

  const absentMemberLines = (data.absentMembersList || []).map((name: string, i: number) =>
    `${i + 1}. ${escapeHtml(name)}`
  ).join("<br>");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 20mm 15mm 20mm 30mm; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 14px;
      line-height: 1.6;
      margin: 0;
      padding: 40px 30px 40px 50px;
      color: #000;
    }
    .header { text-align: center; margin-bottom: 24px; }
    .header .org-name { font-size: 13px; margin-bottom: 16px; }
    .header .title { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .header .subtitle { font-size: 14px; margin-bottom: 2px; }
    .header .date-line { font-size: 14px; margin-top: 4px; }
    .info-line { margin: 6px 0; }
    .presence-section { margin: 20px 0 16px 0; }
    .presence-section p { margin: 4px 0; }
    .quorum-statement { margin: 16px 0; font-style: italic; }
    .protocol-block { margin: 20px 0; page-break-inside: avoid; }
    .protocol-block p { margin: 4px 0; }
    .vote-line { padding-left: 20px; }
    .signatures { margin-top: 60px; page-break-inside: avoid; }
    .sig-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 50px; }
    .sig-block { width: 45%; }
    .sig-block .sig-title { margin-bottom: 30px; }
    .sig-block .sig-line { border-bottom: 1px solid #000; margin-bottom: 4px; }
    .sig-block .sig-name { font-size: 13px; }
    .divider { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="header">
    <div class="org-name">${escapeHtml(data.organizationName)}</div>
    <div class="title">ПРОТОКОЛ № ${escapeHtml(data.meetingNumber)}</div>
    <div class="subtitle">заседания профсоюзного комитета первичной профсоюзной организации</div>
    <div class="subtitle">«${escapeHtml(data.organizationName)}»</div>
    <div class="date-line">от ${data.meetingDate}</div>
  </div>

  <p class="info-line"><strong>Место проведения:</strong> ${escapeHtml(data.meetingPlace) || "____________________"}</p>
  <p class="info-line"><strong>Начало заседания:</strong> ${data.meetingTime || "___:___"}</p>

  <div class="presence-section">
    <p><strong>В состав профкома избраны:</strong> ${data.totalMembers} чел.</p>

    <p><strong>Присутствовали на заседании:</strong> ${data.presentCount} чел.</p>
    <div style="padding-left: 20px; margin: 4px 0;">${presentMemberLines || "____________________"}</div>

    ${absentMemberLines ? `
    <p><strong>Отсутствовали:</strong></p>
    <div style="padding-left: 20px; margin: 4px 0;">${absentMemberLines}</div>
    ` : ""}

    ${data.invitedGuests ? `<p><strong>Присутствовали гости:</strong> ${escapeHtml(data.invitedGuests)}</p>` : ""}
  </div>

  <p class="quorum-statement">В соответствии с п.&nbsp;3 ст.&nbsp;18 Устава Профсоюза заседание профсоюзного комитета считается правомочным (имеет кворум) и объявляется открытым. Присутствуют ${data.presentCount} из ${data.totalMembers} членов (необходимо не менее ${data.quorumRequired}).</p>

  <hr class="divider">

  ${proceduralBlock(
    "Об избрании председательствующего",
    "Об избрании председательствующего на заседании Профкома.",
    data.chairmanReportName,
    `Избрать председательствующим на собрании – ${escapeHtml(data.presidingOfficerName || "____________________")}`,
    vFor("chairmanVotesFor"), vFor("chairmanVotesAgainst"), vFor("chairmanVotesAbstained"),
  )}

  <hr class="divider">

  ${proceduralBlock(
    "Об избрании секретаря",
    "Об избрании секретаря на заседании Профкома.",
    data.secretaryReportName,
    `Избрать секретарем на собрании – ${escapeHtml(data.protocolSecretaryName || "____________________")}`,
    vFor("secretaryVotesFor"), vFor("secretaryVotesAgainst"), vFor("secretaryVotesAbstained"),
  )}

  <hr class="divider">

  ${proceduralBlock(
    "О порядке подсчёта голосов",
    "О порядке подсчёта голосов на заседании профкома.",
    data.voteCounterReportName,
    `Поручить вести подсчет голосов на заседании Профкома – ${data.voteCounterNames.length > 0 ? escapeHtml(data.voteCounterNames.join(", ")) : "____________________"}`,
    vFor("voteCounterVotesFor"), vFor("voteCounterVotesAgainst"), vFor("voteCounterVotesAbstained"),
  )}

  <hr class="divider">

  <div class="protocol-block">
    <p><strong>СЛУШАЛИ:</strong> О повестке дня заседания профсоюзного комитета.</p>
    <p>Докладывал ${escapeHtml(data.presidingOfficerName || "____________________")}.</p>
    <p><strong>ПОСТАНОВИЛИ:</strong> Утвердить повестку дня заседания Профкома:</p>
    ${agendaListHtml}
    <p>Голосовали:</p>
    <p class="vote-line">«За» – ${vFor("agendaApprovalVotesFor")}; &nbsp; «Против» – ${vFor("agendaApprovalVotesAgainst")}; &nbsp; «Воздержались» – ${vFor("agendaApprovalVotesAbstained")}</p>
    <p><em>${getVoteResult(vFor("agendaApprovalVotesFor"), vFor("agendaApprovalVotesAgainst"), vFor("agendaApprovalVotesAbstained"))}</em></p>
  </div>

  <hr class="divider">

  ${agendaItemsHtml}

  <div class="signatures">
    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-title">Председательствующий:</div>
        <div class="sig-line"></div>
        <div class="sig-name">${escapeHtml(data.presidingOfficerName || data.chairmanName || "____________________")}</div>
      </div>
      <div class="sig-block">
        <div class="sig-title">Секретарь:</div>
        <div class="sig-line"></div>
        <div class="sig-name">${escapeHtml(data.protocolSecretaryName || data.secretaryName || "____________________")}</div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
