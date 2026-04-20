import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { DocumentType, DocumentStatus, DocumentCategory } from "@prisma/client";
import { generatePDFFromHTML, getPublicPdfErrorDetail } from "@/lib/document-templates/renderer";
import { ensureMeetingGroupChat } from "@/lib/meeting-chat";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { clearAllMeetingNotifications, notifyParticipantsAboutProtocolApproval } from "@/lib/notifications";
import { mergeInvitedGuestParts } from "@/lib/meeting-invited-guests";

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

    const perm = await checkUserPermissions(session.user.id, "documents_create");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      documentType,
      approve,
      regNumber: regNumberOverride,
      protocolProceduralData: bodyProcedural,
      meetingTime: bodyMeetingTime,
      meetingDate: bodyMeetingDate,
      meetingPlace: bodyMeetingPlace,
      invitedGuests: bodyInvitedGuests,
      voteCounterUserIds: bodyVoteCounterIds,
      presidingOfficerUserId: bodyPresidingId,
      secretaryUserId: bodySecretaryId,
    } = body; // при формировании протокола — все текущие значения с формы

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
        agendaDocument: { select: { id: true, status: true } },
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

    if (meeting.organizationId !== perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    // Протокол можно создавать только после утверждения повестки председателем
    if (documentType === "PROTOCOL") {
      if (!meeting.agendaDocument) {
        return NextResponse.json(
          { error: "Сначала создайте и утвердите повестку дня" },
          { status: 400 }
        );
      }
      if (meeting.agendaDocument.status !== "COMPLETED") {
        return NextResponse.json(
          { error: "Создание протокола возможно только после утверждения повестки председателем (кнопка «Утвердить повестку»)" },
          { status: 400 }
        );
      }
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

    // Дата заседания в документе: при формировании протокола — с формы, иначе из БД
    const docDate =
      documentType === "PROTOCOL" && bodyMeetingDate && typeof bodyMeetingDate === "string" && bodyMeetingDate.trim() !== ""
        ? formatDate(new Date(bodyMeetingDate.trim()))
        : formatDate(meeting.scheduledDate);

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

    // Для протокола: подписывают Председательствующий и Секретарь; при формировании документа используем переданные с формы id, иначе — из БД
    const effectivePresidingId = documentType === "PROTOCOL" && (bodyPresidingId != null && bodyPresidingId !== "") ? bodyPresidingId : meeting.presidingOfficerUserId;
    const effectiveSecretaryId = documentType === "PROTOCOL" && (bodySecretaryId != null && bodySecretaryId !== "") ? bodySecretaryId : meeting.secretaryUserId;

    let presidingOfficerName = "";
    let protocolSecretaryName = "";
    if (documentType === "PROTOCOL" && (effectivePresidingId || effectiveSecretaryId)) {
      const userIds = [effectivePresidingId, effectiveSecretaryId].filter(Boolean) as string[];
      const fromParticipants = userIds.map(uid => meeting.participants.find((p: any) => p.userId === uid)?.user).filter(Boolean);
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
      if (effectivePresidingId) {
        const u = allUsers.find((u: any) => u.id === effectivePresidingId);
        presidingOfficerName = u ? formatUserName(u) : "";
      }
      if (effectiveSecretaryId) {
        const u = allUsers.find((u: any) => u.id === effectiveSecretaryId);
        protocolSecretaryName = u ? formatUserName(u) : "";
      }
    }

    const eligibleVoters = meeting.participants.filter((p: any) => p.canVote);
    const totalEligible = eligibleVoters.length;
    const presentVotersCount = presentMembers.filter((p: any) => p.canVote).length;
    const quorumRequired = Math.floor(totalEligible / 2) + 1;

    // В «Присутствовали на заседании» только члены профкома с правом голоса (приглашённые — во «Присутствовали приглашённые»)
    const presentMembersList = presentMembers
      .filter((p: { canVote?: boolean }) => p.canVote)
      .map((p) => (p.user ? formatUserName(p.user) : p.externalName || ""))
      .filter(Boolean);
    const absentMembersList = absentMembers.map(p =>
      p.user ? formatUserName(p.user) : p.externalName || ""
    ).filter(Boolean);
    // Полный список членов профкома (в составе выборного органа) для блока «В состав профкома избраны»
    const allMembersList = meeting.participants
      .filter((p: any) => p.canVote)
      .map((p: any) => (p.user ? formatUserName(p.user) : p.externalName || ""))
      .filter(Boolean);

    // При формировании протокола используем переданные с формы данные голосований (блоки 2–5), иначе — из БД
    const procedural =
      documentType === "PROTOCOL" && bodyProcedural && typeof bodyProcedural === "object"
        ? bodyProcedural
        : (meeting as any).protocolProceduralData || {};

    const resolveUserName = (userId: string | undefined) => {
      if (!userId) return "";
      const p = meeting.participants.find((p: any) => p.userId === userId);
      if (p?.user) return formatUserName(p.user);
      return "";
    };

    // Ответственные за подсчёт голосов: при формировании протокола — с формы, иначе из БД
    const voteCounterIds: string[] = (() => {
      if (documentType === "PROTOCOL" && bodyVoteCounterIds != null) {
        if (Array.isArray(bodyVoteCounterIds)) return bodyVoteCounterIds.filter((id): id is string => typeof id === "string");
        if (typeof bodyVoteCounterIds === "string") {
          try { return JSON.parse(bodyVoteCounterIds) as string[]; } catch { return []; }
        }
      }
      const raw = (meeting as any).voteCounterUserIds;
      if (!raw) return [];
      try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return []; }
    })();
    const voteCounterNames = voteCounterIds.map(resolveUserName).filter(Boolean);

    // При формировании протокола время начала берём с формы, если передано
    const meetingTime =
      documentType === "PROTOCOL" && typeof bodyMeetingTime === "string" && bodyMeetingTime.trim() !== ""
        ? bodyMeetingTime.trim()
        : meeting.scheduledTime || "";

    // Место и гости: при формировании протокола — с формы, иначе из БД
    const meetingPlace =
      documentType === "PROTOCOL" && bodyMeetingPlace !== undefined && bodyMeetingPlace !== null
        ? String(bodyMeetingPlace).trim()
        : meeting.location || "";
    const invitedGuestsStored =
      documentType === "PROTOCOL" && bodyInvitedGuests !== undefined && bodyInvitedGuests !== null
        ? String(bodyInvitedGuests)
        : (meeting as any).invitedGuests || "";
    const invitedGuestsList = mergeInvitedGuestParts(invitedGuestsStored, meeting.participants);
    const invitedGuestsValue = invitedGuestsList.join(", ");

    const templateData = {
      organizationName: meeting.organization.name,
      organizationChairmanName: meeting.organization.chairmanName || formatUserName(chairman?.user),
      organizationChairmanJobTitle: meeting.organization.chairmanJobTitle || "Председатель профкома",
      meetingNumber: meeting.number || "1",
      meetingDate: docDate,
      meetingTime,
      meetingPlace,
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
      absentCount: absentMembersList.length,
      allMembersList,
      invitedGuests: invitedGuestsValue,
      invitedGuestsList,

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
    } catch (pdfError: unknown) {
      console.error("Ошибка генерации PDF:", pdfError);
      const devDetail = pdfError instanceof Error ? pdfError.message : String(pdfError);
      const prodDetail = process.env.NODE_ENV !== "development" ? getPublicPdfErrorDetail(pdfError) : undefined;
      return NextResponse.json(
        {
          error: "Не удалось сформировать PDF документа",
          details: process.env.NODE_ENV === "development" ? devDetail : prodDetail,
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
      // Сбрасываем согласования: все «согласовано» → «Ожидает»
      await prisma.documentApproval.updateMany({
        where: { documentId: document.id },
        data: { status: "PENDING", comment: null, approvedAt: null },
      });
      // Обновляем копии во «Входящих» у участников — подменяем на новый PDF и контент
      const fileName = filePath ? filePath.split("/").pop() : null;
      const copies = await prisma.document.findMany({
        where: { metadata: { path: ["originalDocumentId"], equals: document.id } },
        select: { id: true },
      });
      if (copies.length > 0) {
        await prisma.document.updateMany({
          where: { id: { in: copies.map((c) => c.id) } },
          data: {
            title: documentTitle,
            content: htmlContent,
            filePath,
            fileName,
            updatedAt: new Date(),
          },
        });
      }
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

    // Привязка документа к заседанию (только при создании повестки). Рассылка — только по кнопкам «Разослать на согласование» или «Утвердить без согласования».
    if (documentType === "AGENDA" && !meeting.agendaDocumentId) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { agendaDocumentId: document.id },
      });
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

    // При формировании протокола сохраняем в заседании процедурные данные и данные с формы (место, время, приглашённые), чтобы выписка и другие документы их видели
    if (documentType === "PROTOCOL") {
      const meetingUpdateData: { protocolProceduralData?: object; location?: string; scheduledTime?: string; invitedGuests?: string | null } = {};
      if (procedural && typeof procedural === "object") {
        meetingUpdateData.protocolProceduralData = procedural as object;
      }
      if (bodyMeetingPlace !== undefined && bodyMeetingPlace !== null) {
        meetingUpdateData.location = String(bodyMeetingPlace).trim() || null;
      }
      if (typeof bodyMeetingTime === "string" && bodyMeetingTime.trim() !== "") {
        meetingUpdateData.scheduledTime = bodyMeetingTime.trim();
      }
      meetingUpdateData.invitedGuests = invitedGuestsValue.trim() || null;
      if (Object.keys(meetingUpdateData).length > 0) {
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: meetingUpdateData,
        });
      }
    }

    // При утверждении протокола — статус заседания «Завершено», архив чата, сообщение от ИИ
    if (documentType === "PROTOCOL" && approve === true) {
      try {
        await ensureMeetingGroupChat(meeting.id);
        const meetingWithChat = await prisma.meeting.findUnique({
          where: { id: meeting.id },
          include: { groupChat: { select: { id: true } } },
        });
        if (meetingWithChat?.groupChat) {
          const chatId = meetingWithChat.groupChat.id;
          await prisma.chat.update({
            where: { id: chatId },
            data: { archivedAt: new Date() },
          });
          const botUser = await getOrCreateAIBotUser();
          const msg = await prisma.chatMessage.create({
            data: {
              chatId,
              senderId: botUser.id,
              content: "Чат закрыт. Переведен в архив.",
              messageType: "system",
            },
          });
          await prisma.chat.update({
            where: { id: chatId },
            data: { lastMessageId: msg.id, lastMessageAt: new Date() },
          });
          const participants = await prisma.chatParticipant.findMany({
            where: { chatId, leftAt: null },
            select: { userId: true },
          });
          const { invalidateUserChatsCache } = await import("@/lib/cache-invalidation");
          await Promise.allSettled(participants.map((p) => invalidateUserChatsCache(p.userId)));
        }
      } catch (err) {
        console.warn("[generate-document] Error archiving chat / AI message:", err);
      }
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: "COMPLETED", actualEndAt: new Date() },
      });
      await clearAllMeetingNotifications(meeting.id).catch((err) =>
        console.warn("[generate-document] clearAllMeetingNotifications:", err)
      );
      await notifyParticipantsAboutProtocolApproval(meeting.id).catch((err) =>
        console.warn("[generate-document] notifyParticipantsAboutProtocolApproval:", err)
      );
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
        groupChat: { select: { id: true, archivedAt: true } },
        agendaDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
        protocolDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
        resolutions: { select: { id: true, regNumber: true, status: true, filePath: true, title: true } },
        extracts: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, metadata: true } },
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
  const items = meeting.agendaItems ?? [];
  const agendaItemsHtml = items
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
      <p>Докладывал ${escapeHtml(reporterName || "____________________")}.</p>
      <p><strong>ПОСТАНОВИЛИ:</strong> ${escapeHtml(resolvedText)}</p>
      <p>Голосовали:</p>
      <p class="vote-line">«За» – ${vF}; &nbsp; «Против» – ${vA}; &nbsp; «Воздержались» – ${vAbs}</p>
      <p><em>${getVoteResult(vF, vA, vAbs)}</em></p>
    </div>
  `;

  // В блоке 5 в протоколе перечисляем все пункты; без галочки — с припиской «(не актуально)»
  const approvedAgendaIds = proc.agendaApprovedItemIds;
  const approvedSet =
    approvedAgendaIds && Array.isArray(approvedAgendaIds) && approvedAgendaIds.length > 0
      ? new Set(approvedAgendaIds as string[])
      : new Set(meeting.agendaItems.map((item: any) => item.id));
  const agendaListHtml = meeting.agendaItems.map((item: any) => {
    const suffix = approvedSet.has(item.id) ? "" : " <strong>(не актуально)</strong>";
    return `<p style="margin: 2px 0; padding-left: 20px;">${item.orderNumber}. ${escapeHtml(item.title)}${suffix}</p>`;
  }).join("");

  // Блок 6 «Рассмотрение вопросов повестки дня»: только активные (отмеченные галочкой) пункты
  const agendaItemsForBlock6 = meeting.agendaItems.filter((item: any) => approvedSet.has(item.id));
  const agendaItemsHtml = agendaItemsForBlock6.map((item: any) => {
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

  const allMemberLines = (data.allMembersList || []).map((name: string, i: number) =>
    `${i + 1}. ${escapeHtml(name)}`
  ).join("<br>");

  const invitedGuestLines = (data.invitedGuestsList || []).map((name: string, i: number) =>
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
    <div style="padding-left: 20px; margin: 4px 0;">${allMemberLines || "____________________"}</div>

    <p><strong>Присутствовали на заседании:</strong> ${data.presentCount} чел.</p>
    <div style="padding-left: 20px; margin: 4px 0;">${presentMemberLines || "____________________"}</div>

    ${absentMemberLines ? `
    <p><strong>Отсутствовали:</strong> ${data.absentCount} чел.</p>
    <div style="padding-left: 20px; margin: 4px 0;">${absentMemberLines}</div>
    ` : ""}

    ${invitedGuestLines ? `
    <p><strong>Присутствовали приглашённые:</strong> ${data.invitedGuestsList.length} чел.</p>
    <div style="padding-left: 20px; margin: 4px 0;">${invitedGuestLines}</div>
    ` : ""}
  </div>

  <p class="quorum-statement">В соответствии с п.&nbsp;3 ст.&nbsp;18 Устава Профсоюза заседание профсоюзного комитета считается правомочным (имеет кворум) и объявляется открытым.</p>

  ${proceduralBlock(
    "Об избрании председательствующего",
    "Об избрании председательствующего на заседании Профкома.",
    data.chairmanReportName,
    `Избрать председательствующим на собрании – ${escapeHtml(data.presidingOfficerName || "____________________")}`,
    vFor("chairmanVotesFor"), vFor("chairmanVotesAgainst"), vFor("chairmanVotesAbstained"),
  )}

  ${proceduralBlock(
    "Об избрании секретаря",
    "Об избрании секретаря на заседании Профкома.",
    data.secretaryReportName,
    `Избрать секретарем на собрании – ${escapeHtml(data.protocolSecretaryName || "____________________")}`,
    vFor("secretaryVotesFor"), vFor("secretaryVotesAgainst"), vFor("secretaryVotesAbstained"),
  )}

  ${proceduralBlock(
    "О порядке подсчёта голосов",
    "О порядке подсчёта голосов на заседании профкома.",
    data.voteCounterReportName,
    `Поручить вести подсчет голосов на заседании Профкома – ${data.voteCounterNames.length > 0 ? escapeHtml(data.voteCounterNames.join(", ")) : "____________________"}`,
    vFor("voteCounterVotesFor"), vFor("voteCounterVotesAgainst"), vFor("voteCounterVotesAbstained"),
  )}

  <div class="protocol-block">
    <p><strong>СЛУШАЛИ:</strong> О повестке дня заседания профсоюзного комитета.</p>
    <p>Докладывал ${escapeHtml(data.presidingOfficerName || "____________________")}.</p>
    <p><strong>ПОСТАНОВИЛИ:</strong> Утвердить повестку дня заседания Профкома:</p>
    ${agendaListHtml}
    <p>Голосовали:</p>
    <p class="vote-line">«За» – ${vFor("agendaApprovalVotesFor")}; &nbsp; «Против» – ${vFor("agendaApprovalVotesAgainst")}; &nbsp; «Воздержались» – ${vFor("agendaApprovalVotesAbstained")}</p>
    <p><em>${getVoteResult(vFor("agendaApprovalVotesFor"), vFor("agendaApprovalVotesAgainst"), vFor("agendaApprovalVotesAbstained"))}</em></p>
  </div>

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
