import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/**
 * Проверяет что файл является PDF документом
 */
function validatePDF(buffer: Buffer): { valid: boolean; error?: string } {
  // Проверяем магические байты PDF: %PDF-
  const pdfHeader = buffer.slice(0, 5).toString('ascii');
  if (!pdfHeader.startsWith('%PDF-')) {
    return { valid: false, error: 'Файл не является PDF документом' };
  }
  
  // Проверяем что это не поврежденный файл (минимальный размер)
  if (buffer.length < 100) {
    return { valid: false, error: 'Файл слишком маленький или поврежден' };
  }
  
  return { valid: true };
}

/**
 * Простое извлечение текста из PDF для проверки содержимого
 * (извлекает видимые текстовые строки между stream objects)
 */
function extractTextFromPDF(buffer: Buffer): string {
  try {
    const content = buffer.toString('latin1');
    
    // Ищем текстовые блоки между BT (Begin Text) и ET (End Text)
    const textBlocks: string[] = [];
    const btPattern = /BT\s+([\s\S]*?)\s+ET/g;
    let match;
    
    while ((match = btPattern.exec(content)) !== null) {
      const block = match[1];
      // Извлекаем текст из Tj и TJ операторов
      const textPattern = /\((.*?)\)\s*Tj/g;
      let textMatch;
      while ((textMatch = textPattern.exec(block)) !== null) {
        textBlocks.push(textMatch[1]);
      }
    }
    
    return textBlocks.join(' ');
  } catch (error) {
    console.error('[upload] Error extracting text from PDF:', error);
    return '';
  }
}

/**
 * Определяет тип документа по содержимому PDF
 */
function detectDocumentType(
  fileName: string,
  pdfText: string
): "MEMBERSHIP_APPLICATION" | "CONTRIBUTION_APPLICATION" | "OTHER" {
  const fileNameLower = fileName.toLowerCase();
  const textLower = pdfText.toLowerCase();
  
  // Ключевые слова для заявления о вступлении
  const membershipKeywords = [
    'заявление о вступлении',
    'прошу принять меня',
    'вступлени',
    'в профсоюз',
    'membership'
  ];
  
  // Ключевые слова для заявления о взносах
  const contributionKeywords = [
    'заявление о взносах',
    'удержан',
    'профсоюзн',
    'членск',
    'взнос',
    'contribution'
  ];
  
  // Проверяем имя файла
  let fileNameScore = { membership: 0, contribution: 0 };
  for (const keyword of membershipKeywords) {
    if (fileNameLower.includes(keyword)) fileNameScore.membership++;
  }
  for (const keyword of contributionKeywords) {
    if (fileNameLower.includes(keyword)) fileNameScore.contribution++;
  }
  
  // Проверяем содержимое
  let contentScore = { membership: 0, contribution: 0 };
  for (const keyword of membershipKeywords) {
    if (textLower.includes(keyword)) contentScore.membership++;
  }
  for (const keyword of contributionKeywords) {
    if (textLower.includes(keyword)) contentScore.contribution++;
  }
  
  // Определяем тип по максимальному score
  const membershipTotal = fileNameScore.membership * 2 + contentScore.membership;
  const contributionTotal = fileNameScore.contribution * 2 + contentScore.contribution;
  
  console.log('[upload] Document type detection:', {
    fileName,
    scores: { membership: membershipTotal, contribution: contributionTotal },
    textPreview: textLower.substring(0, 200)
  });
  
  if (membershipTotal > contributionTotal && membershipTotal > 0) {
    return 'MEMBERSHIP_APPLICATION';
  } else if (contributionTotal > 0) {
    return 'CONTRIBUTION_APPLICATION';
  }
  
  return 'OTHER';
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const sessionId = formData.get("sessionId") as string;
    
    // Поддержка как одиночного файла, так и множественных (membership, contribution)
    const membershipFile = formData.get("membership") as File | null;
    const contributionFile = formData.get("contribution") as File | null;
    const singleFile = formData.get("file") as File | null;
    
    console.log('[upload] Received files:', {
      membership: membershipFile ? { name: membershipFile.name, type: membershipFile.type, size: membershipFile.size } : null,
      contribution: contributionFile ? { name: contributionFile.name, type: contributionFile.type, size: contributionFile.size } : null,
      single: singleFile ? { name: singleFile.name, type: singleFile.type, size: singleFile.size } : null,
    });
    
    const filesToUpload: Array<{file: File, type?: string}> = [];
    
    if (membershipFile) {
      filesToUpload.push({ file: membershipFile, type: "MEMBERSHIP_APPLICATION" });
    }
    if (contributionFile) {
      filesToUpload.push({ file: contributionFile, type: "CONTRIBUTION_APPLICATION" });
    }
    if (singleFile) {
      filesToUpload.push({ file: singleFile });
    }

    if (filesToUpload.length === 0) {
      console.error('[upload] No files provided');
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }
    
    console.log('[upload] Processing', filesToUpload.length, 'file(s)');
    
    const uploadedDocuments = [];
    
    for (const {file, type: forcedType} of filesToUpload) {

    // Ограничиваем размер файла до 50MB (как указано в UI)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Файл слишком большой. Максимальный размер: 50MB" },
        { status: 400 }
      );
    }

    // Проверяем тип файла
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Недопустимый формат файла. Разрешены: PDF, JPG, PNG" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Для PDF проверяем валидность, для изображений просто пропускаем
    let pdfText = "";
    if (file.type === "application/pdf") {
      const pdfValidation = validatePDF(buffer);
      if (!pdfValidation.valid) {
        return NextResponse.json(
          { error: pdfValidation.error || "Файл не является валидным PDF документом" },
          { status: 400 }
        );
      }
      // Извлекаем текст из PDF для определения типа
      pdfText = extractTextFromPDF(buffer);
      console.log('[upload] Extracted PDF text length:', pdfText.length);
    }
    
    // Определяем тип документа по содержимому или используем forcedType
    let documentType = forcedType || (pdfText ? detectDocumentType(file.name, pdfText) : "OTHER");
    
    // Дополнительная проверка по типу сессии
    if (sessionId) {
      const chatSession = await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId: session.user.id,
        },
      });

      if (chatSession?.type === "STATEMENT") {
        // В чате заявления - если тип не определен, используем MEMBERSHIP_APPLICATION по умолчанию
        if (documentType === "OTHER") {
          console.log('[upload] Document type not detected, defaulting to MEMBERSHIP_APPLICATION for STATEMENT session');
          documentType = "MEMBERSHIP_APPLICATION";
        }
      } else {
        // Для других типов сессий проверяем что документ релевантен
        if (documentType === "OTHER") {
          return NextResponse.json(
            { error: "Не удалось определить тип документа. Пожалуйста, загрузите подписанное заявление о вступлении или взносах." },
            { status: 400 }
          );
        }
      }
    }
    
    // Валидация что в документе есть необходимые элементы
    // Для изображений (JPG/PNG) не проверяем содержимое - это нормально
    // Для PDF: НЕ блокируем если текст не извлечен - может быть сканированный документ (изображения)
    if (documentType === "MEMBERSHIP_APPLICATION" || documentType === "CONTRIBUTION_APPLICATION") {
      if (file.type === "application/pdf") {
        // Проверяем только что PDF валидный (уже проверили выше)
        // Если текст извлечен - хорошо, если нет - возможно это сканированный документ
        if (pdfText.length > 0) {
          console.log(`[upload] PDF text extracted: ${pdfText.length} characters`);
        } else {
          console.log('[upload] No text extracted from PDF - possibly scanned document (images only)');
          // Это нормально для сканированных документов - не блокируем
        }
      } else {
        console.log(`[upload] Image file uploaded: ${file.type}`);
        // Для изображений не проверяем содержимое - это нормально
      }
    }

    // Создаем директорию для загрузок если её нет
    const uploadDir = path.join(process.cwd(), "public", "uploads", "documents");
    await mkdir(uploadDir, { recursive: true });

    // Генерируем уникальное имя файла
    const timestamp = Date.now();
    let fileExtension = path.extname(file.name);
    // Если расширение не определено, определяем по MIME типу
    if (!fileExtension) {
      if (file.type === "image/jpeg" || file.type === "image/jpg") {
        fileExtension = ".jpg";
      } else if (file.type === "image/png") {
        fileExtension = ".png";
      } else if (file.type === "application/pdf") {
        fileExtension = ".pdf";
      }
    }
    const baseName = path.basename(file.name, path.extname(file.name));
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_");
    const uniqueFileName = `${sanitizedBaseName}_${session.user.id}_${timestamp}${fileExtension}`;
    const filePath = path.join(uploadDir, uniqueFileName);

    // Сохраняем файл
    await writeFile(filePath, buffer);

    // Сохраняем информацию о документе в базе данных
    const relativePath = `/uploads/documents/${uniqueFileName}`;
    
    // Если это заявление, проверяем, есть ли уже документ этого типа (не создаем новый)
    let document;
    if (documentType === "MEMBERSHIP_APPLICATION" || documentType === "CONTRIBUTION_APPLICATION") {
      // Ищем любой существующий документ этого типа (независимо от статуса)
      const existingDoc = await prisma.document.findFirst({
        where: {
          userId: session.user.id,
          type: documentType,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (existingDoc) {
        // Всегда обновляем существующий документ, добавляя подписанный файл
        document = await prisma.document.update({
          where: { id: existingDoc.id },
          data: {
            status: "SIGNED",
            signedFilePath: relativePath,
            updatedAt: new Date(),
          },
        });
        console.log(`[upload] Updated existing ${documentType} with signed file:`, document.id);
      } else {
        // Если документа нет вообще - создаем новый (но это не должно происходить в нормальном flow)
        console.warn(`[upload] No existing ${documentType} found, creating new document (unexpected)`);
        document = await prisma.document.create({
          data: {
            userId: session.user.id,
            type: documentType,
            status: "SIGNED",
            title: file.name,
            fileName: file.name,
            filePath: relativePath,
            signedFilePath: relativePath,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
          },
        });
      }
    } else {
      // Для других типов документов просто создаем новый
      document = await prisma.document.create({
        data: {
          userId: session.user.id,
          type: documentType,
          status: "GENERATED",
          title: file.name,
          fileName: file.name,
          filePath: relativePath,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
        },
      });
    }

      console.log(`[upload] Document uploaded successfully:`, {
        id: document.id,
        type: documentType,
        status: document.status,
        fileName: file.name
      });
      
      uploadedDocuments.push({
        documentId: document.id,
        documentType,
        fileName: file.name,
        filePath: relativePath,
      });
    } // end for loop

    return NextResponse.json({
      success: true,
      documents: uploadedDocuments,
      message: `Загружено файлов: ${uploadedDocuments.length}`,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке файла" },
      { status: 500 }
    );
  }
}

