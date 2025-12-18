import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType } from "@prisma/client";
import { generateDocumentFromTemplate } from "@/lib/document-templates/renderer";
import { extractUserVariables } from "@/lib/document-templates/renderer";
import { uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * POST /api/ppo-head/documents/create
 * Создать документ профкома по шаблону
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman || !chairman.organization) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      templateId,
      type,
      title,
      meetingDate,
      meetingTime,
      meetingPlace,
      agendaItems,
      votingParticipants,
      presentMembers,
      absentMembers,
      secretaryName,
      secretaryJobTitle,
      resolutionNumber,
      protocolNumber,
    } = body;

    if (!templateId || !type || !title) {
      return NextResponse.json(
        { error: "Шаблон, тип и название документа обязательны" },
        { status: 400 }
      );
    }

    // Получаем шаблон
    const template = await prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || !template.isActive) {
      return NextResponse.json(
        { error: "Шаблон не найден или неактивен" },
        { status: 404 }
      );
    }

    // Получаем данные участников голосования
    let votingParticipantsData: Array<{ name: string; jobTitle: string }> = [];
    if (votingParticipants && votingParticipants.length > 0) {
      const participants = await prisma.user.findMany({
        where: {
          id: { in: votingParticipants },
          organizationId: chairman.organizationId,
        },
        select: {
          firstName: true,
          lastName: true,
          middleName: true,
          jobTitle: true,
        },
      });

      votingParticipantsData = participants.map((p) => ({
        name: [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" "),
        jobTitle: p.jobTitle || "",
      }));
    }

    // Получаем данные присутствующих
    let presentMembersData: string[] = [];
    if (presentMembers && presentMembers.length > 0) {
      const present = await prisma.user.findMany({
        where: {
          id: { in: presentMembers },
          organizationId: chairman.organizationId,
        },
        select: {
          firstName: true,
          lastName: true,
          middleName: true,
        },
      });

      presentMembersData = present.map((p) =>
        [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ")
      );
    }

    // Получаем данные отсутствующих
    let absentMembersData: string[] = [];
    if (absentMembers && absentMembers.length > 0) {
      const absent = await prisma.user.findMany({
        where: {
          id: { in: absentMembers },
          organizationId: chairman.organizationId,
        },
        select: {
          firstName: true,
          lastName: true,
          middleName: true,
        },
      });

      absentMembersData = absent.map((p) =>
        [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ")
      );
    }

    // Форматируем дату заседания
    let formattedMeetingDate = "";
    if (meetingDate) {
      const date = new Date(meetingDate);
      formattedMeetingDate = `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()}`;
    }

    // Форматируем время заседания
    let formattedMeetingTime = "";
    if (meetingTime) {
      const [hours, minutes] = meetingTime.split(":");
      formattedMeetingTime = `${hours}:${minutes}`;
    }

    // Форматируем пункты повестки дня
    const formattedAgendaItems = (agendaItems || [])
      .filter((item: string) => item.trim())
      .map((item: string, index: number) => `${index + 1}. ${item.trim()}`)
      .join("\n");

    // Форматируем список участников голосования
    const formattedVotingParticipants = votingParticipantsData
      .map((p) => `${p.name}${p.jobTitle ? ` - ${p.jobTitle}` : ""}`)
      .join("\n");

    // Извлекаем базовые переменные из председателя
    const baseVariables = await extractUserVariables(chairman);

    // Добавляем специфичные переменные для документов профкома
    const variables = {
      ...baseVariables,
      meetingDate: formattedMeetingDate,
      meetingTime: formattedMeetingTime,
      meetingPlace: meetingPlace || "",
      agendaItems: formattedAgendaItems,
      votingParticipants: formattedVotingParticipants,
      presentMembers: presentMembersData.join("\n"),
      absentMembers: absentMembersData.join("\n"),
      secretaryName: secretaryName || "",
      secretaryJobTitle: secretaryJobTitle || "",
      resolutionNumber: resolutionNumber || "",
      protocolNumber: protocolNumber || "",
    };

    // Рендерим HTML шаблон
    const renderedHTML = renderTemplate(template.htmlContent, variables);

    // Добавляем CSS стили, если они есть
    const fullHTML = template.cssStyles
      ? `<style>${template.cssStyles}</style>${renderedHTML}`
      : renderedHTML;

    // Генерируем PDF
    const pdfBuffer = await generatePDFFromHTML(fullHTML);

    // Сохраняем файл
    const fileName = `${type}_${Date.now()}.pdf`;
    const fileKey = `documents/${fileName}`;
    
    let filePath: string;
    
    if (isVDSStorageConfigured()) {
      try {
        filePath = await uploadFileToVDS(
          fileKey,
          pdfBuffer,
          "application/pdf"
        );
        console.log(`[ppo-head/documents] File uploaded to VDS: ${filePath}`);
      } catch (vdsError) {
        console.error("[ppo-head/documents] VDS upload failed:", vdsError);
        throw new Error(`Не удалось загрузить файл на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
      }
    } else {
      throw new Error("VDS storage не настроен");
    }

    // Сохраняем метаданные документа
    const metadata: any = {};
    if (votingParticipants && votingParticipants.length > 0) {
      metadata.votingParticipants = votingParticipants;
    }
    if (meetingDate) {
      metadata.meetingDate = meetingDate;
    }
    if (agendaItems && agendaItems.length > 0) {
      metadata.agendaItems = agendaItems;
    }
    if (presentMembers && presentMembers.length > 0) {
      metadata.presentMembers = presentMembers;
    }
    if (absentMembers && absentMembers.length > 0) {
      metadata.absentMembers = absentMembers;
    }

    // Создаем запись в БД
    const document = await prisma.document.create({
      data: {
        type: type as DocumentType,
        status: "GENERATED",
        title,
        filePath,
        fileName,
        fileSize: pdfBuffer.length,
        userId: chairman.id,
        organizationId: chairman.organizationId,
        templateId: template.id,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        type: document.type,
        filePath: document.filePath,
      },
    });
  } catch (error: any) {
    console.error("[ppo-head/documents] POST create error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании документа",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

