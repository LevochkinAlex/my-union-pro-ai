import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";
import { writeFile } from "fs/promises";
import { getKnowledgeQueue } from "@/lib/queues/knowledgeQueue";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "knowledge");

// Убеждаемся, что директория существует
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error("[knowledge] Ошибка создания директории:", error);
  }
}

// POST - загрузка документа в базу знаний
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id:string }> }
) {
  try {
    const { session, error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const knowledgeBaseId = resolvedParams.id;

    // Проверяем существование базы знаний
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!knowledgeBase) {
      return NextResponse.json(
        { error: "База знаний не найдена" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const entry = formData.get("file");

    if (!(entry instanceof File)) {
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }

    const file = entry;

    const extension = path.extname(file.name).slice(1).toLowerCase();
    const mimeType = file.type?.toLowerCase();
    const supportedExtensions = [
      "pdf",
      "docx",
      "doc",
      "txt",
      "md",
      "csv",
      "xlsx",
      "xls",
      "json",
      "html",
      "htm",
      "ppt",
      "pptx",
    ];

    if (
      extension && !supportedExtensions.includes(extension) &&
      (!mimeType || !supportedExtensions.some((ext) => mimeType.includes(ext)))
    ) {
      return NextResponse.json(
        { error: "Неподдерживаемый тип файла" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Сохраняем файл
    const fileExtension = path.extname(file.name) || `.${extension}`;
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;
    const fileKey = `knowledge/${fileName}`;
    
    let filePath: string;
    
    // Всегда загружаем на VDS, если он настроен
    if (isVDSStorageConfigured()) {
      try {
        filePath = await uploadFileToVDS(fileKey, buffer, file.type || "application/octet-stream");
        console.log(`[knowledge/documents] File uploaded to VDS: ${filePath}`);
      } catch (vdsError) {
        console.error("[knowledge/documents] VDS upload failed:", vdsError);
        throw new Error(`Не удалось загрузить файл на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
      }
    } else {
      // Локальное хранилище (только для разработки)
      await ensureUploadDir();
      const localFilePath = path.join(UPLOAD_DIR, fileName);
      await writeFile(localFilePath, buffer);
      filePath = `/uploads/knowledge/${fileName}`;
      console.log(`[knowledge/documents] File saved locally (VDS not configured): ${filePath}`);
    }

    // Определяем тип файла для базы данных
    const dbFileType = fileExtension.slice(1).toLowerCase();
    const isImage = ["png", "jpg", "jpeg"].includes(dbFileType);
    const contentType = isImage ? "IMAGE" : "TEXT";

    const source = await prisma.knowledgeSource.create({
      data: {
        knowledgeBaseId,
        type: "FILE",
        title: file.name,
        metadata: {
          mimeType: file.type || dbFileType,
          size: file.size,
        },
        status: "PROCESSING",
        lastFetchedAt: new Date(),
      },
    });

    // Создаем запись в базе данных
    const document = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        sourceId: source.id,
        fileName,
        originalName: file.name,
        fileType: dbFileType,
        fileSize: file.size,
        filePath: filePath,
        mimeType: file.type || null,
        contentType,
        processingStatus: "QUEUED",
        uploadedByUserId: session?.user?.id ?? null,
      },
    });

    const queue = getKnowledgeQueue();
    await queue.add("process-document", { documentId: document.id });
    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        status: "PROCESSING",
        metadata: {
          mimeType: file.type || dbFileType,
          size: file.size,
        },
        lastFetchedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        fileName: document.fileName,
        originalName: document.originalName,
        fileType: document.fileType,
        processingStatus: document.processingStatus,
      },
      source: {
        id: source.id,
        status: "PROCESSING",
      },
    });
  } catch (error) {
    console.error("[admin/knowledge-bases/documents] POST error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить документ" },
      { status: 500 }
    );
  }
}

// GET - список документов в базе знаний
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { session, error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const knowledgeBaseId = resolvedParams.id;

    const documents = await prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[admin/knowledge-bases] GET documents error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить документы" },
      { status: 500 }
    );
  }
}

