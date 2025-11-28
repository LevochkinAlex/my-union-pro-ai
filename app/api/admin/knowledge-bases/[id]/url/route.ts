import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnowledgeQueue } from "@/lib/queues/knowledgeQueue";
import { ensureSuperAdmin } from "@/lib/admin-auth";

// POST - добавление URL в базу знаний
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const { url, title, category } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL обязателен" },
        { status: 400 }
      );
    }

    if (typeof url !== "string") {
      return NextResponse.json(
        { error: "Неверный формат URL" },
        { status: 400 }
      );
    }

    // Валидация URL
    try {
    const { id } = await params;
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Неверный формат URL" },
        { status: 400 }
      );
    }

    // Создаем source
    const source = await prisma.knowledgeSource.create({
      data: {
        knowledgeBaseId,
        type: "URL",
        url: url.trim(),
        title: title?.trim() || url.trim(),
        metadata: {
          category: category || null,
          addedBy: session?.user?.email || "unknown",
        },
        status: "PENDING",
        lastFetchedAt: null,
      },
    });

    // Создаем запись документа
    const document = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        sourceId: source.id,
        fileName: null,
        originalName: title?.trim() || url.trim(),
        fileType: "url",
        fileSize: 0,
        filePath: url.trim(),
        mimeType: "text/html",
        contentType: "TEXT",
        processingStatus: "QUEUED",
        uploadedByUserId: session?.user?.id ?? null,
        meta: {
          url: url.trim(),
          category: category || null,
        },
      },
    });

    // Добавляем в очередь обработки
    const queue = getKnowledgeQueue();
    await queue.add("process-document", { documentId: document.id });
    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        status: "PROCESSING",
        lastFetchedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        originalName: document.originalName,
        processingStatus: document.processingStatus,
      },
      source: {
        id: source.id,
        url: source.url,
        status: "PROCESSING",
      },
    });
  } catch (error) {
    console.error("[admin/knowledge-bases/url] POST error:", error);
    return NextResponse.json(
      { error: "Не удалось добавить URL" },
      { status: 500 }
    );
  }
}

