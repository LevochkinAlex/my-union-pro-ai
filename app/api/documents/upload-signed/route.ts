import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

/**
 * Асинхронная верификация документа (не блокирует основной запрос)
 */
async function verifyDocumentAsync(documentId: string, documentType: string, userId: string) {
  try {
    console.log("[upload-signed] Starting async verification for:", documentId);
    
    // Небольшая задержка для имитации обработки
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Получаем данные пользователя для проверки
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, middleName: true },
    });

    // Определяем тип документа для сообщения
    const docTypeName = documentType === "MEMBERSHIP_APPLICATION" 
      ? "Заявление о вступлении в профсоюз"
      : documentType === "CONTRIBUTION_APPLICATION"
        ? "Заявление о перечислении членских взносов"
        : "Документ";

    // Обновляем статус верификации
    await prisma.document.update({
      where: { id: documentId },
      data: {
        verificationStatus: "VERIFIED",
        verificationMessage: `${docTypeName} предварительно проверено. Ожидает одобрения председателем.`,
        verifiedAt: new Date(),
      },
    });

    console.log("[upload-signed] Verification completed for:", documentId);
  } catch (error) {
    console.error("[upload-signed] Verification error:", error);
    
    // В случае ошибки помечаем как требующий проверки
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          verificationStatus: "NEEDS_REVIEW",
          verificationMessage: "Не удалось выполнить автоматическую проверку. Документ будет проверен вручную.",
          verifiedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error("[upload-signed] Failed to update verification status:", updateError);
    }
  }
}

/**
 * POST /api/documents/upload-signed
 * Загрузка подписанного документа
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const documentId = formData.get("documentId") as string;

    if (!file || !documentId) {
      return NextResponse.json(
        { error: "Файл и ID документа обязательны" },
        { status: 400 }
      );
    }

    console.log("[upload-signed] Uploading:", {
      userId: session.user.id,
      documentId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    // Документ: владелец (userId), протокол, постановление или выписка заседания, где текущий пользователь — председатель
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        meetingAsProtocol: {
          include: {
            participants: {
              where: { role: "CHAIRMAN", userId: session.user.id },
              select: { id: true },
            },
          },
        },
        meetingResolution: {
          include: {
            participants: {
              where: { role: "CHAIRMAN", userId: session.user.id },
              select: { id: true },
            },
          },
        },
        meetingExtract: {
          include: {
            participants: { select: { id: true, userId: true, role: true } },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Документ не найден" },
        { status: 404 }
      );
    }

    const isOwner = document.userId === session.user.id;
    const isChairmanOfProtocol =
      document.meetingAsProtocol &&
      document.meetingAsProtocol.participants.some((p) => p.id);
    const isChairmanOfResolutionMeeting =
      document.meetingResolution &&
      document.meetingResolution.participants.some((p) => p.id);
    const isChairmanOfExtractMeeting =
      document.meetingExtract &&
      document.meetingExtract.participants.some(
        (p: { userId: string; role: string }) => p.userId === session.user.id && p.role === "CHAIRMAN"
      );
    const isParticipantOfExtractMeeting =
      document.meetingExtract &&
      document.meetingExtract.participants.some((p: { userId: string }) => p.userId === session.user.id);
    const perm = document.meetingExtract
      ? await checkUserPermissions(session.user.id, "documents_view")
      : null;
    const isChairmanOrDeputyOfOrg = perm
      ? perm.isChairman || (!!perm.roleName && /зам|заместитель/i.test(perm.roleName))
      : false;
    const isChairmanOrDeputyOfExtractMeeting =
      isChairmanOfExtractMeeting || (!!isParticipantOfExtractMeeting && isChairmanOrDeputyOfOrg);

    if (!isOwner && !isChairmanOfProtocol && !isChairmanOfResolutionMeeting && !isChairmanOrDeputyOfExtractMeeting) {
      return NextResponse.json(
        { error: "Нет прав на загрузку подписанного документа" },
        { status: 403 }
      );
    }

    // Валидация файла
    const maxSize = 50 * 1024 * 1024; // 50 МБ
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Файл слишком большой (максимум 50 МБ)" },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Недопустимый тип файла. Разрешены: PDF, JPG, PNG" },
        { status: 400 }
      );
    }

    // Сохраняем файл
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const extension = path.extname(file.name);
    const timestamp = Date.now();
    const safeFileName = `signed_${documentId}_${timestamp}${extension}`;
    const fileKey = `signed/${safeFileName}`;
    
    let publicPath: string;

    const saveLocally = async (): Promise<string> => {
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "signed");
      await mkdir(uploadsDir, { recursive: true });
      const localPath = path.join(uploadsDir, safeFileName);
      await writeFile(localPath, buffer);
      return `/uploads/signed/${safeFileName}`;
    };

    if (isVDSStorageConfigured()) {
      try {
        publicPath = await uploadFileToVDS(fileKey, buffer, file.type);
        console.log(`[upload-signed] File uploaded to VDS: ${publicPath}`);
      } catch (vdsError) {
        console.error("[upload-signed] VDS upload failed:", vdsError);
        publicPath = await saveLocally();
        console.log("[upload-signed] Fallback: file saved locally:", publicPath);
      }
    } else {
      publicPath = await saveLocally();
      console.log("[upload-signed] File saved locally (VDS не настроен):", publicPath);
    }

    console.log("[upload-signed] File saved:", publicPath);

    // Для протокола, постановления и выписки заседания статус SIGNED выставляется только по кнопке «Подписать», не при загрузке скана
    const isProtocol = !!document.meetingAsProtocol;
    const isResolution = !!document.meetingResolution;
    const isExtract = !!document.meetingExtract;
    const updatedDoc = await prisma.document.update({
      where: { id: documentId },
      data: {
        signedFilePath: publicPath,
        ...(isProtocol || isResolution || isExtract ? {} : { status: "SIGNED" }),
        verificationStatus: "VERIFYING",
        verificationMessage: null,
        verifiedAt: null,
        updatedAt: new Date(),
      },
    });

    console.log("[upload-signed] Document updated:", updatedDoc.id);

    // Асинхронно запускаем верификацию (не блокируем ответ)
    verifyDocumentAsync(documentId, document.type, document.userId);

    return NextResponse.json({
      success: true,
      document: updatedDoc,
      message: "Документ загружен и отправлен на проверку",
      verificationStatus: "VERIFYING",
    });
  } catch (error) {
    console.error("[upload-signed] Error:", error);
    return NextResponse.json(
      {
        error: "Не удалось загрузить документ",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

