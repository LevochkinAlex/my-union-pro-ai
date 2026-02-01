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

    // Для протокола: если уже есть документ — обновляем его (тот же номер)
    const existingProtocolDoc = documentType === "PROTOCOL" && meeting.protocolDocumentId
      ? await prisma.document.findUnique({ where: { id: meeting.protocolDocumentId } })
      : null;

    const docPrefix = documentType === "AGENDA" ? "AG" : "PR";
    const year = meeting.scheduledDate.getFullYear();
    let regNumber: string;

    if (existingProtocolDoc?.regNumber) {
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
      
      presentMembers: presentMembers.map(p => 
        p.user ? formatUserName(p.user) : p.externalName || ""
      ).filter(Boolean).join(", "),
      
      absentMembers: absentMembers.map(p => 
        p.user ? formatUserName(p.user) : p.externalName || ""
      ).filter(Boolean).join(", "),
      
      totalMembers: meeting.participants.length,
      presentCount: presentMembers.length,
      quorum: presentMembers.length >= Math.ceil(meeting.participants.length / 2) ? "имеется" : "отсутствует",
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

    if (existingProtocolDoc) {
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
      try {
        const result = await assignAgendaToParticipantsAndNotify(meeting.id, session.user.id);
        console.log(`[generate-document] Повестка: назначено ${result.assignedCount} участникам, уведомлено ${result.notifiedCount}`);
      } catch (notifyErr) {
        console.error("[generate-document] Ошибка рассылки повестки участникам:", notifyErr);
        // Не падаем — документ создан, рассылку можно повторить вручную
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

    const message = existingProtocolDoc
      ? (approve === true ? "Протокол обновлён и утверждён. Можно отправлять в печать." : "Протокол сохранён в черновики.")
      : (documentType === "PROTOCOL" && approve === true
        ? "Протокол создан и утверждён. Можно отправлять в печать."
        : `${documentType === "AGENDA" ? "Повестка" : "Протокол"} успешно сформирован(а).`);

    return NextResponse.json({ document, message });
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
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 14px;
      line-height: 1.5;
      margin: 0;
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .title {
      font-size: 16px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .subtitle {
      font-size: 14px;
      margin-bottom: 5px;
    }
    .info {
      margin: 20px 0;
    }
    .info-row {
      margin-bottom: 5px;
    }
    .agenda-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .agenda-table td {
      border: 1px solid #333;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">ПОВЕСТКА ДНЯ</div>
    <div class="subtitle">заседания профсоюзного комитета</div>
    <div class="subtitle"><strong>${data.organizationName}</strong></div>
    <div class="subtitle">№ ${data.regNumber} от ${data.meetingDate}</div>
  </div>

  <div class="info">
    <div class="info-row"><strong>Время:</strong> ${data.meetingTime || "___:___"}</div>
    <div class="info-row"><strong>Место проведения:</strong> ${data.meetingPlace || "_________________________"}</div>
  </div>

  <p><strong>Вопросы для обсуждения:</strong></p>

  <table class="agenda-table">
    <tbody>
      ${agendaItemsHtml}
    </tbody>
  </table>
</body>
</html>
  `.trim();
}

// Генерация HTML для Протокола.
// Данные берутся из meeting.agendaItems (поля заполняются в форме «Заполнение протокола» и сохраняются через PATCH /api/ppo-head/meetings/[id]/agenda):
// — СЛУШАЛИ: item.heardText || item.title
// — ДОКЛАДЫВАЛ: item.speakerName / item.speaker, item.speakerPosition / item.speaker.jobTitle, item.coSpeakerName / item.coSpeaker
// — ПОСТАНОВИЛИ: item.resolutionText
// — ГОЛОСОВАНИЕ: item.votesFor, item.votesAgainst, item.votesAbstained; Решение: item.isApproved (true/false)
// — РЕШИЛИ: item.decidedText (если указано)
function generateProtocolHTML(meeting: any, data: any): string {
  const agendaItemsHtml = meeting.agendaItems
    .map((item: any) => {
      const speakerName = item.speakerName ||
        (item.speaker ? [item.speaker.lastName, item.speaker.firstName, item.speaker.middleName].filter(Boolean).join(" ") : "");
      const coSpeakerName = item.coSpeakerName ||
        (item.coSpeaker ? [item.coSpeaker.lastName, item.coSpeaker.firstName, item.coSpeaker.middleName].filter(Boolean).join(" ") : "");
      const speakerLine = speakerName || "____________________________";
      const coSpeakerLine = coSpeakerName ? ` Со-докладчик: ${coSpeakerName}` : "";
      const positionText = (item.speakerPosition || (item.speaker?.jobTitle ?? "")).trim();
      const positionLine = positionText ? ` ${escapeHtml(positionText)}` : "";
      return `
        <div class="agenda-item">
          <p class="item-number"><strong>${item.orderNumber}. ${escapeHtml(item.title)}</strong></p>
          
          <div class="section">
            <p class="section-title">СЛУШАЛИ:</p>
            <p>${escapeHtml(item.heardText || item.title)}</p>
          </div>
          
          <div class="section">
            <p class="section-title">ДОКЛАДЫВАЛ:</p>
            <p>${escapeHtml(speakerLine)}${positionLine}${coSpeakerLine ? `<br>Со-докладчик: ${escapeHtml(coSpeakerName)}` : ""}</p>
          </div>
          
          <div class="section">
            <p class="section-title">ПОСТАНОВИЛИ:</p>
            <p>${escapeHtml(item.resolutionText || "____________________________")}</p>
          </div>
          
          <div class="voting">
            <p class="section-title">ГОЛОСОВАНИЕ:</p>
            <table class="voting-table">
              <tr>
                <td>За:</td>
                <td><strong>${item.votesFor || 0}</strong></td>
                <td>Против:</td>
                <td><strong>${item.votesAgainst || 0}</strong></td>
                <td>Воздержались:</td>
                <td><strong>${item.votesAbstained || 0}</strong></td>
              </tr>
            </table>
            <p>Решение: <strong>${item.isApproved === true ? "ПРИНЯТО" : item.isApproved === false ? "НЕ ПРИНЯТО" : "___________"}</strong></p>
          </div>
          ${item.decidedText ? `
          <div class="section">
            <p class="section-title">РЕШИЛИ:</p>
            <p>${escapeHtml(item.decidedText)}</p>
          </div>
          ` : ""}
        </div>
        <hr style="margin: 20px 0; border: none; border-top: 1px dashed #ccc;">
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 14px;
      line-height: 1.5;
      margin: 0;
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .title {
      font-size: 18px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .subtitle {
      font-size: 14px;
      margin-bottom: 5px;
    }
    .info {
      margin: 20px 0;
      display: flex;
      gap: 30px;
    }
    .info-block {
      flex: 1;
    }
    .presence {
      margin: 20px 0;
      padding: 15px;
      background: #f9f9f9;
      border-left: 3px solid #333;
    }
    .agenda-item {
      margin: 25px 0;
      page-break-inside: avoid;
    }
    .item-number {
      font-size: 15px;
      margin-bottom: 10px;
    }
    .section {
      margin: 10px 0;
      padding-left: 20px;
    }
    .section-title {
      font-weight: bold;
      color: #333;
      margin-bottom: 5px;
    }
    .voting {
      margin: 15px 0;
      padding: 10px;
      background: #f5f5f5;
    }
    .voting-table {
      margin: 10px 0;
    }
    .voting-table td {
      padding: 5px 15px 5px 0;
    }
    .signatures {
      margin-top: 50px;
      page-break-inside: avoid;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
    }
    .signature-block {
      text-align: center;
    }
    .signature-line {
      border-bottom: 1px solid #000;
      width: 200px;
      margin: 5px auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">ПРОТОКОЛ № ${data.meetingNumber}</div>
    <div class="subtitle">заседания профсоюзного комитета</div>
    <div class="subtitle"><strong>${data.organizationName}</strong></div>
  </div>

  <div class="info">
    <div class="info-block">
      <p><strong>Номер документа:</strong> ${data.regNumber}</p>
      <p><strong>Дата заседания:</strong> ${data.meetingDate}</p>
      <p><strong>Начало:</strong> ${data.meetingTime || "___:___"}</p>
    </div>
    <div class="info-block">
      <p><strong>Место проведения:</strong></p>
      <p>${data.meetingPlace || "_________________________"}</p>
    </div>
  </div>

  <div class="presence">
    <p><strong>В состав профкома избраны:</strong> ${data.totalMembers} чел.</p>
    <p><strong>Присутствовали на заседании:</strong> ${data.presentCount} чел.</p>
    <p>${data.presentMembers || "___________________________"}</p>
    ${data.absentMembers ? `<p><strong>Отсутствовали:</strong> ${data.absentMembers}</p>` : ""}
    <p><strong>Кворум:</strong> ${data.quorum}</p>
  </div>

  <h3 style="text-align: center; margin: 30px 0;">ПОВЕСТКА ДНЯ:</h3>

  ${agendaItemsHtml}

  <div class="signatures">
    <div class="signature-row">
      <div class="signature-block">
        <p>${data.signatureLabelChairman ?? "Председательствующий"}</p>
        <div class="signature-line"></div>
        <p>${data.chairmanName || "_________________________"}</p>
      </div>
      <div class="signature-block">
        <p>Секретарь</p>
        <div class="signature-line"></div>
        <p>${data.secretaryName || "_________________________"}</p>
      </div>
    </div>
  </div>

  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    Дата формирования: ${data.currentDate}
  </p>
</body>
</html>
  `.trim();
}
