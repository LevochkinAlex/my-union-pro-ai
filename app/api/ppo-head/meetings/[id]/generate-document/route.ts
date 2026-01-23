import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { DocumentType, DocumentStatus, DocumentCategory } from "@prisma/client";
import { generatePDFFromHTML } from "@/lib/document-templates/renderer";

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
    const { documentType } = body; // "AGENDA" или "PROTOCOL"

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

    // Генерация номера документа
    const docPrefix = documentType === "AGENDA" ? "AG" : "PR";
    const year = meeting.scheduledDate.getFullYear();
    
    // Получаем последний номер для данного типа в году
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
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const regNumber = `${docPrefix}${String(nextNumber).padStart(5, "0")}`;
    const docDate = formatDate(meeting.scheduledDate);

    // Формирование данных для шаблона
    const formatUserName = (user: any) => {
      if (!user) return "";
      return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ");
    };

    const chairman = meeting.participants.find(p => p.role === "CHAIRMAN");
    const secretary = meeting.participants.find(p => p.role === "SECRETARY");
    const presentMembers = meeting.participants.filter(p => p.attendance === "PRESENT");
    const absentMembers = meeting.participants.filter(p => p.attendance === "ABSENT" || p.attendance === "EXCUSED");

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
      
      chairmanName: formatUserName(chairman?.user) || meeting.organization.chairmanName || "",
      secretaryName: formatUserName(secretary?.user) || "",
      secretaryJobTitle: secretary?.user?.jobTitle || "Секретарь",
      
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
    let filePath = null;
    let pdfBuffer: Buffer | null = null;

    try {
      pdfBuffer = await generatePDFFromHTML(htmlContent);
      // Сохранение PDF в public
      const fileName = `${documentType.toLowerCase()}_${regNumber}_${Date.now()}.pdf`;
      const fs = await import("fs/promises");
      const path = await import("path");
      const publicDir = path.join(process.cwd(), "public", "generated-documents");
      await fs.mkdir(publicDir, { recursive: true });
      const fullPath = path.join(publicDir, fileName);
      await fs.writeFile(fullPath, pdfBuffer);
      filePath = `/generated-documents/${fileName}`;
    } catch (pdfError) {
      console.error("Ошибка генерации PDF:", pdfError);
      // Продолжаем без PDF
    }

    // Создание документа в БД
    // Статус DRAFT - документ создан, но еще не отправлен на согласование
    const document = await prisma.document.create({
      data: {
        type: documentType as DocumentType,
        status: DocumentStatus.DRAFT, // Черновик - согласно алгоритму
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

    // Привязка документа к заседанию
    if (documentType === "AGENDA") {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { agendaDocumentId: document.id },
      });

      // Назначаем повестку дня всем участникам заседания для ознакомления
      // Согласно алгоритму: Шаг 3. Ознакомление/согласование повестки
      // Примечание: документ создается в статусе DRAFT, отправка на согласование происходит отдельно
      const participantsWithUserId = meeting.participants.filter(p => p.user?.id && p.role !== "CHAIRMAN");
      
      if (participantsWithUserId.length > 0) {
        // Назначаем документ первому участнику для отображения в его списке документов
        // Остальные участники получат доступ через систему согласований
        await prisma.document.update({
          where: { id: document.id },
          data: {
            assignedToId: participantsWithUserId[0].user!.id,
            assignedAt: new Date(),
          },
        });

        console.log(`[generate-document] Повестка дня создана. Для отправки на согласование используйте функцию "Отправить на согласование"`);
      }
    } else {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { protocolDocumentId: document.id },
      });

      // Назначаем протокол всем участникам заседания для ознакомления
      // Согласно алгоритму: Шаг 5. Оформление протокола
      // Примечание: документ создается в статусе DRAFT, отправка на согласование происходит отдельно
      const participantsWithUserId = meeting.participants.filter(p => p.user?.id && p.role !== "CHAIRMAN");
      
      if (participantsWithUserId.length > 0) {
        // Назначаем документ первому участнику для отображения в его списке документов
        // Остальные участники получат доступ через систему согласований
        await prisma.document.update({
          where: { id: document.id },
          data: {
            assignedToId: participantsWithUserId[0].user!.id,
            assignedAt: new Date(),
          },
        });

        console.log(`[generate-document] Протокол создан. Для отправки на согласование используйте функцию "Отправить на согласование"`);
      }
    }

    return NextResponse.json({ 
      document,
      message: `${documentType === "AGENDA" ? "Повестка" : "Протокол"} успешно сформирован(а)${documentType === "AGENDA" ? ` и назначена ${meeting.participants.filter(p => p.user?.id).length} участникам` : ""}`,
    });
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

// Генерация HTML для Повестки дня
function generateAgendaHTML(meeting: any, data: any): string {
  const agendaItemsHtml = meeting.agendaItems
    .map((item: any, index: number) => `
      <tr>
        <td style="width: 40px; text-align: center; vertical-align: top; padding: 8px;">${item.orderNumber}.</td>
        <td style="padding: 8px;">
          <strong>${item.title}</strong>
          ${item.description ? `<br><span style="color: #666;">${item.description}</span>` : ""}
          ${item.speakerName || item.speaker ? `
            <br><em>Докладчик: ${item.speakerName || [item.speaker?.lastName, item.speaker?.firstName, item.speaker?.middleName].filter(Boolean).join(" ")}</em>
          ` : ""}
        </td>
      </tr>
    `)
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
    .signatures {
      margin-top: 40px;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      margin-top: 30px;
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

  <div class="signatures">
    <div class="signature-row">
      <div class="signature-block">
        <p>Председатель профкома</p>
        <div class="signature-line"></div>
        <p>${data.organizationChairmanName}</p>
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

// Генерация HTML для Протокола
function generateProtocolHTML(meeting: any, data: any): string {
  const agendaItemsHtml = meeting.agendaItems
    .map((item: any) => {
      const speakerName = item.speakerName || 
        (item.speaker ? [item.speaker.lastName, item.speaker.firstName, item.speaker.middleName].filter(Boolean).join(" ") : "");
      
      return `
        <div class="agenda-item">
          <p class="item-number"><strong>${item.orderNumber}. ${item.title}</strong></p>
          
          <div class="section">
            <p class="section-title">СЛУШАЛИ:</p>
            <p>${item.heardText || item.title}</p>
          </div>
          
          <div class="section">
            <p class="section-title">ДОКЛАДЫВАЛ:</p>
            <p>${speakerName || "____________________________"} ${item.speakerPosition || ""}</p>
          </div>
          
          <div class="section">
            <p class="section-title">ПОСТАНОВИЛИ:</p>
            <p>${item.resolutionText || "____________________________"}</p>
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
            <p>${item.decidedText}</p>
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
        <p>Председатель</p>
        <div class="signature-line"></div>
        <p>${data.chairmanName}</p>
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
