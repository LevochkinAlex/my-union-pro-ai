import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initVDSStorageFromEnv, getFileFromVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { generatePDFFromHTML, getPublicPdfErrorDetail } from "@/lib/document-templates/renderer";
import { DocumentType } from "@prisma/client";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

function resolveFilePath(filePath: string) {
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return path.join(process.cwd(), "public", normalized);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  console.log("[documents/download] ===== ROUTE HANDLER CALLED =====");
  console.log("[documents/download] Request URL:", request.url);
  
  try {
    const session = await getServerSession(authOptions);
    console.log("[documents/download] Session:", session ? "exists" : "null");

    if (!session?.user?.id) {
      console.log("[documents/download] No session, returning 401");
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    let { id } = resolvedParams;
    // Декодируем ID, если он был закодирован
    if (id) {
      try {
        id = decodeURIComponent(id);
      } catch (e) {
        // Если декодирование не удалось, используем исходный ID
        console.warn("[documents/download] Не удалось декодировать ID, используем исходный:", id);
      }
    }
    console.log("[documents/download] Resolved ID:", id);
    const { searchParams } = new URL(request.url);
    const downloadSigned = searchParams.get("signed") === "true";
    const inline = searchParams.get("inline") === "1" || searchParams.get("inline") === "true";

    console.log("[documents/download] ===== START DOWNLOAD =====");
    console.log("[documents/download] Document ID:", id);
    console.log("[documents/download] ID type:", typeof id);
    console.log("[documents/download] ID length:", id?.length);
    console.log("[documents/download] Full URL:", request.url);
    console.log("[documents/download] Session user ID:", session.user.id);

    // Обработка системного документа устава (доступен всем пользователям)
    // Проверяем как точное совпадение, так и возможные варианты
    const isCharterSystem = id === "charter-system" || id?.includes("charter");
    console.log("[documents/download] Is charter system?", isCharterSystem);
    
    if (isCharterSystem) {
      console.log("[documents/download] Processing charter document request");
      const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
      const CHARTER_FILENAME = "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
      
      // Сначала проверяем, есть ли устав в базе данных пользователя
      const userCharter = await prisma.document.findFirst({
        where: {
          userId: session.user.id,
          type: "OTHER",
          title: {
            contains: "Устав",
          },
        },
      });
      
      // Если устав есть в БД пользователя, используем его
      if (userCharter && userCharter.filePath) {
        try {
          const absolutePath = resolveFilePath(userCharter.filePath);
          await fs.access(absolutePath);
          const fileBuffer = await fs.readFile(absolutePath);
          
          const contentType = userCharter.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          const fileName = userCharter.fileName || CHARTER_FILENAME;
          
          return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
              "Content-Length": fileBuffer.length.toString(),
            },
          });
        } catch (error) {
          console.error("[documents/download] Ошибка при чтении файла устава из БД:", error);
          // Продолжаем попытку найти системный файл
        }
      }
      
      // Пытаемся найти системный файл устава
      try {
        const absolutePath = resolveFilePath(CHARTER_PATH);
        await fs.access(absolutePath);
        const fileBuffer = await fs.readFile(absolutePath);
        
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(CHARTER_FILENAME)}"`,
            "Content-Length": fileBuffer.length.toString(),
          },
        });
      } catch (error) {
        console.error("[documents/download] Ошибка при чтении системного файла устава:", error);
        console.error("[documents/download] Путь:", CHARTER_PATH);
        console.error("[documents/download] Абсолютный путь:", resolveFilePath(CHARTER_PATH));
        
        // Если файл не найден, возвращаем понятное сообщение
        return NextResponse.json(
          { 
            error: "Файл устава не найден на сервере. Обратитесь к администратору для загрузки файла.",
            details: "Файл должен находиться по пути: public/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx"
          },
          { status: 404 }
        );
      }
    }

    // Получаем документ
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Проверяем права доступа
    let hasAccess = false;
    
    // Системные документы (устав) доступны всем авторизованным пользователям
    if (id === "charter-system" || (document.type === "OTHER" && 
        (document.title?.toLowerCase().includes("устав") || 
         document.description?.toLowerCase().includes("устав")))) {
      hasAccess = true;
    }
    
    // Пользователь может скачать свои документы
    if (document.userId === session.user.id) {
      hasAccess = true;
    }
    
    // Пользователь может скачать документы, назначенные ему для ознакомления
    if (document.assignedToId === session.user.id) {
      hasAccess = true;
    }
    
    // Супер-админ имеет доступ ко всем документам
    if (session.user.role === "SUPER_ADMIN") {
      hasAccess = true;
    }
    
    // Председатель ППО имеет доступ к документам членов своей организации
    if (!hasAccess && (session.user.role === "PPO_HEAD" || (session.user as any).viewMode === "PPO_HEAD")) {
      // Получаем информацию о председателе
      const chairman = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { 
          ppoHeadOrganizationId: true,
          organizationId: true,
        },
      });
      
      // Получаем информацию о владельце документа (если есть)
      if (document.userId) {
        const documentOwner = await prisma.user.findUnique({
          where: { id: document.userId },
          select: { organizationId: true },
        });
        
        const chairmanOrgId = chairman?.ppoHeadOrganizationId || chairman?.organizationId;
        
        if (chairmanOrgId && documentOwner?.organizationId === chairmanOrgId) {
          hasAccess = true;
          console.log("[documents/download] Chairman access granted for member document");
        }
      }
    }

    // Участник заседания может просматривать повестку и протокол этого заседания (режим только чтение)
    if (!hasAccess && (document.type === "AGENDA" || document.type === "PROTOCOL")) {
      const meeting = await prisma.meeting.findFirst({
        where: {
          OR: [
            { agendaDocumentId: id },
            { protocolDocumentId: id },
          ],
        },
        select: { id: true },
      });
      if (meeting) {
        const participant = await prisma.meetingParticipant.findFirst({
          where: { meetingId: meeting.id, userId: session.user.id },
          select: { id: true },
        });
        if (participant) {
          hasAccess = true;
        }
      }
    }

    // Участник заседания может просматривать постановления и выписки этого заседания
    if (!hasAccess && (document.type === "RESOLUTION" || document.type === "PROTOCOL_EXTRACT")) {
      const docWithMeeting = document as { meetingResolutionId?: string | null; meetingExtractId?: string | null };
      const meetingId = docWithMeeting.meetingResolutionId ?? docWithMeeting.meetingExtractId;
      if (meetingId) {
        const participant = await prisma.meetingParticipant.findFirst({
          where: { meetingId, userId: session.user.id },
          select: { id: true },
        });
        if (participant) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      console.log("[documents/download] Access denied:", {
        userId: session.user.id,
        documentId: id,
        documentUserId: document.userId,
        documentAssignedToId: document.assignedToId,
        documentType: document.type,
        documentTitle: document.title
      });
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    // Проверяем, является ли документ уставом
    const isCharterDocument = document.type === "OTHER" && 
      (document.title?.toLowerCase().includes("устав") || 
       document.description?.toLowerCase().includes("устав"));

    // Если это устав и файл не найден, пытаемся использовать системный файл
    if (isCharterDocument && !document.filePath) {
      console.log("[documents/download] Устав без filePath, пытаемся найти системный файл");
      const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
      const CHARTER_FILENAME = document.fileName || "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
      
      try {
        const absolutePath = resolveFilePath(CHARTER_PATH);
        await fs.access(absolutePath);
        const fileBuffer = await fs.readFile(absolutePath);
        
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            "Content-Type": document.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(CHARTER_FILENAME)}"`,
            "Content-Length": fileBuffer.length.toString(),
          },
        });
      } catch (error) {
        console.error("[documents/download] Системный файл устава не найден:", error);
        return NextResponse.json(
          { error: "Файл устава не найден на сервере. Обратитесь к администратору." },
          { status: 404 }
        );
      }
    }

    // Для копий во «Входящих» (metadata.originalDocumentId) всегда отдаём актуальный файл оригинала
    let docToServe = document;
    const meta = document.metadata as { originalDocumentId?: string } | null;
    // Копия во «Входящих»: подставляем актуальный оригинал. Раньше брали только при original.filePath —
    // на проде файл PDF мог отсутствовать, а HTML жил в content — тогда просмотр падал.
    if (!downloadSigned && meta?.originalDocumentId && document.assignedToId) {
      const original = await prisma.document.findUnique({
        where: { id: meta.originalDocumentId },
        select: { id: true, filePath: true, content: true, type: true },
      });
      if (original) {
        const useContent =
          original.content != null && String(original.content).trim().length > 0
            ? original.content
            : document.content;
        if (original.filePath || useContent) {
          docToServe = {
            ...document,
            filePath: original.filePath ?? document.filePath,
            content: useContent,
            type: original.type,
          } as typeof document;
        }
      }
    }

    // Определяем, какой файл скачивать: подписанный или обычный
    let filePathToDownload = downloadSigned && docToServe.signedFilePath 
      ? docToServe.signedFilePath 
      : docToServe.filePath;
    
    console.log("[documents/download] File selection:", {
      downloadSigned,
      hasSignedFilePath: !!docToServe.signedFilePath,
      signedFilePath: docToServe.signedFilePath,
      filePath: docToServe.filePath,
      selectedPath: filePathToDownload
    });
    
    // Если запрашивается подписанный файл, но его нет - возвращаем ошибку сразу
    if (downloadSigned && !document.signedFilePath) {
      console.error("[documents/download] Подписанный файл не указан в документе");
      return NextResponse.json(
        { error: "Подписанный документ не найден. Пожалуйста, загрузите подписанный документ." },
        { status: 404 }
      );
    }

    let fileBuffer: Buffer | null = null;

    // Повестка/протокол/постановление/выписка: в content хранится HTML для пересборки PDF; остальные типы — base64 файла
    const isHtmlSourceDocument =
      docToServe.type === DocumentType.AGENDA ||
      docToServe.type === DocumentType.PROTOCOL ||
      docToServe.type === DocumentType.RESOLUTION ||
      docToServe.type === DocumentType.PROTOCOL_EXTRACT;
    if (docToServe.content && !downloadSigned && !isHtmlSourceDocument) {
      // Документ хранится в базе данных как base64 (только для обычного файла)
      fileBuffer = Buffer.from(docToServe.content, "base64");
      console.log("[documents/download] Загружен из базы данных (base64), размер:", fileBuffer.length);
    } else if (filePathToDownload) {
      // Документ хранится как файл на диске или VDS
      try {
        // Проверяем, является ли путь VDS URL (начинается с http:// или https://)
        const isVDSFile = filePathToDownload.startsWith("http://") || filePathToDownload.startsWith("https://");
        
        if (isVDSFile && isVDSStorageConfigured()) {
          // Файл на VDS - извлекаем fileKey из URL
          try {
            const url = new URL(filePathToDownload);
            // Извлекаем путь после домена (например, /uploads/documents/file.pdf)
            const pathParts = url.pathname.split("/").filter(p => p);
            // Убираем первый элемент если это "uploads" или оставляем как есть
            const fileKey = pathParts.slice(pathParts[0] === "uploads" ? 1 : 0).join("/");
            
            console.log("[documents/download] Downloading from VDS:", fileKey);
            fileBuffer = await getFileFromVDS(fileKey);
            console.log("[documents/download] File downloaded from VDS, size:", fileBuffer.length);
          } catch (vdsError) {
            console.error("[documents/download] VDS download failed:", vdsError);
            // Fallback на локальное хранилище
            let absolutePath = resolveFilePath(filePathToDownload);
            try {
              await fs.access(absolutePath);
              fileBuffer = await fs.readFile(absolutePath);
              console.log("[documents/download] Fallback to local file, size:", fileBuffer.length);
            } catch (localError) {
              throw new Error(`File not found on VDS or locally: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
            }
          }
        } else {
          // Локальный файл - сначала пытаемся прочитать локально
          let absolutePath = resolveFilePath(filePathToDownload);
          console.log("[documents/download] Пытаемся прочитать файл:", absolutePath);
          console.log("[documents/download] Исходный путь из БД:", filePathToDownload);
          console.log("[documents/download] Скачиваем подписанный файл:", downloadSigned);
          
          // Проверяем существование файла локально
          let fileExistsLocally = false;
          try {
            await fs.access(absolutePath);
            fileExistsLocally = true;
            console.log("[documents/download] Файл существует локально");
          } catch (accessError) {
            console.log("[documents/download] Файл не существует локально, проверяем VDS");
            fileExistsLocally = false;
          }
          
          // Если файл не найден локально и VDS настроен, пытаемся скачать с VDS
          if (!fileExistsLocally && isVDSStorageConfigured()) {
            try {
              // Извлекаем fileKey из пути (убираем /uploads/ если есть)
              const normalizedPath = filePathToDownload.startsWith("/") ? filePathToDownload.slice(1) : filePathToDownload;
              const pathParts = normalizedPath.split("/");
              // Если путь начинается с "uploads", пропускаем его
              const fileKey = pathParts[0] === "uploads" 
                ? pathParts.slice(1).join("/")
                : normalizedPath;
              
              console.log("[documents/download] Пытаемся скачать с VDS, fileKey:", fileKey);
              console.log("[documents/download] Исходный путь:", filePathToDownload);
              console.log("[documents/download] Нормализованный путь:", normalizedPath);
              
              fileBuffer = await getFileFromVDS(fileKey);
              console.log("[documents/download] ✅ Файл успешно скачан с VDS, размер:", fileBuffer.length);
            } catch (vdsError) {
              console.error("[documents/download] ❌ Ошибка скачивания с VDS:", vdsError);
              console.error("[documents/download] Детали ошибки:", vdsError instanceof Error ? vdsError.message : String(vdsError));
              // Продолжаем с проверкой устава или возвратом ошибки
            }
          }
          
          // Если файл существует локально, но еще не прочитан - читаем его
          if (fileExistsLocally && !fileBuffer) {
            try {
              fileBuffer = await fs.readFile(absolutePath);
              console.log("[documents/download] ✅ Файл успешно прочитан локально, размер:", fileBuffer.length);
            } catch (readError) {
              console.error("[documents/download] ❌ Ошибка чтения локального файла:", readError);
            }
          }
          
          // Если файл все еще не найден
          if (!fileBuffer && !fileExistsLocally) {
            // Если это устав и файл не найден, пытаемся использовать системный файл
            if (isCharterDocument && !downloadSigned) {
              console.log("[documents/download] Устав без файла, пытаемся найти системный файл");
              const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
              const CHARTER_FILENAME = document.fileName || "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
              
              try {
                const charterAbsolutePath = resolveFilePath(CHARTER_PATH);
                await fs.access(charterAbsolutePath);
                const fileBuffer = await fs.readFile(charterAbsolutePath);
                
                return new NextResponse(fileBuffer, {
                  status: 200,
                  headers: {
                    "Content-Type": document.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "Content-Disposition": `attachment; filename="${encodeURIComponent(CHARTER_FILENAME)}"`,
                    "Content-Length": fileBuffer.length.toString(),
                  },
                });
              } catch (charterError) {
                console.error("[documents/download] Системный файл устава тоже не найден:", charterError);
                // Продолжаем с обычной ошибкой
              }
            }
            
            // Для документов с HTML в БД не возвращаем 404 — ниже сгенерируем PDF из content
            if (isHtmlSourceDocument && docToServe.content) {
              // не возвращаем 404, выходим из блока — сработает fallback генерации из HTML
            } else if (downloadSigned) {
              console.error("[documents/download] Подписанный документ не найден:");
              console.error("[documents/download]   - Локальный путь:", absolutePath);
              console.error("[documents/download]   - VDS попытка:", isVDSStorageConfigured() ? "выполнена" : "не выполнена (VDS не настроен)");
              console.error("[documents/download]   - filePathToDownload:", filePathToDownload);
              
              // Если VDS настроен, пытаемся еще раз с правильным fileKey
              if (isVDSStorageConfigured() && !fileBuffer) {
                try {
                  const normalizedPath = filePathToDownload.startsWith("/") ? filePathToDownload.slice(1) : filePathToDownload;
                  const pathParts = normalizedPath.split("/");
                  const fileKey = pathParts[0] === "uploads" 
                    ? pathParts.slice(1).join("/")
                    : normalizedPath;
                  
                  console.log("[documents/download] Последняя попытка скачать с VDS, fileKey:", fileKey);
                  fileBuffer = await getFileFromVDS(fileKey);
                  console.log("[documents/download] ✅ Файл найден на VDS!");
                } catch (finalVdsError) {
                  console.error("[documents/download] ❌ Финальная попытка VDS также не удалась:", finalVdsError);
                }
              }
              
              // Если все еще не найден, возвращаем ошибку
              if (!fileBuffer) {
                return NextResponse.json(
                  { 
                    error: `Подписанный документ не найден. Пожалуйста, загрузите подписанный документ.`,
                    details: process.env.NODE_ENV === "development" ? {
                      localPath: absolutePath,
                      vdsConfigured: isVDSStorageConfigured(),
                      filePath: filePathToDownload
                    } : undefined
                  },
                  { status: 404 }
                );
              }
            } else if (!(isHtmlSourceDocument && docToServe.content)) {
              return NextResponse.json(
                { error: `Файл не найден: ${filePathToDownload}` },
                { status: 404 }
              );
            }
          }
          
          // Если файл существует локально, читаем его
          if (fileExistsLocally && !fileBuffer) {
            fileBuffer = await fs.readFile(absolutePath);
            console.log("[documents/download] Файл успешно прочитан локально, размер:", fileBuffer.length);
          }
        }
      } catch (error) {
        console.error("[documents/download] Ошибка при чтении файла:", error);
        console.error("[documents/download] Путь:", filePathToDownload);
        console.error("[documents/download] Абсолютный путь:", resolveFilePath(filePathToDownload));
        return NextResponse.json(
          { error: `Не удалось прочитать файл: ${error instanceof Error ? error.message : String(error)}` },
          { status: 500 }
        );
      }
    }

    // На проде файл может отсутствовать (эфемерная ФС): для повестки/протокола и др. с HTML — генерируем PDF
    if (!fileBuffer && docToServe.content && isHtmlSourceDocument) {
      try {
        fileBuffer = await generatePDFFromHTML(docToServe.content);
        console.log("[documents/download] PDF сгенерирован из HTML (fallback для прода), размер:", fileBuffer.length);
      } catch (pdfErr) {
        console.error("[documents/download] Ошибка генерации PDF из HTML:", pdfErr, "type:", docToServe.type, "contentLen:", docToServe.content?.length);
        const devDetail = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        const prodDetail = getPublicPdfErrorDetail(pdfErr);
        return NextResponse.json(
          {
            error: "Не удалось сформировать документ для просмотра",
            details: process.env.NODE_ENV === "development" ? devDetail : prodDetail ?? undefined,
          },
          { status: 500 }
        );
      }
    }

    if (!fileBuffer) {
      console.error("[documents/download] Содержимое документа не найдено. filePath:", docToServe.filePath, "content:", docToServe.content ? "есть" : "нет");
      return NextResponse.json(
        { error: "Содержимое документа не найдено" },
        { status: 404 }
      );
    }

    // Определяем Content-Type на основе mimeType документа или расширения файла
    let contentType = document.mimeType || "application/pdf";
    const fileNameToUse = downloadSigned && document.signedFilePath
      ? (filePathToDownload?.split("/").pop() || document.fileName || "document.pdf")
      : (document.fileName || "document.pdf");
    
    if (!contentType || contentType === "application/pdf") {
      // Если mimeType не указан или PDF, проверяем расширение файла
      const fileName = fileNameToUse || filePathToDownload || "";
      if (fileName.endsWith(".docx")) {
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (fileName.endsWith(".doc")) {
        contentType = "application/msword";
      } else if (fileName.endsWith(".pdf")) {
        contentType = "application/pdf";
      }
    }

    console.log("[documents/download] Возвращаем файл:", {
      contentType,
      fileName: fileNameToUse,
      size: fileBuffer.length,
      signed: downloadSigned,
      inline,
    });

    const disposition = inline ? "inline" : "attachment";
    // RFC 5987: filename* для UTF-8 имён (кириллица) — улучшает открытие PDF в браузере на проде
    const safeFileName = fileNameToUse.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const contentDisposition =
      disposition +
      `; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(fileNameToUse)}`;

    return new NextResponse(fileBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    console.error("Ошибка скачивания документа:", error);
    return NextResponse.json(
      { error: "Ошибка при скачивании документа" },
      { status: 500 }
    );
  }
}

