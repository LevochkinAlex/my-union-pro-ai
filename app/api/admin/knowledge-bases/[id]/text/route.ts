import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnowledgeQueue } from "@/lib/queues/knowledgeQueue";
import { ensureSuperAdmin } from "@/lib/admin-auth";

// POST - добавление текста в базу знаний
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

    const { title, content, category } = await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "Название и контент обязательны" },
        { status: 400 }
      );
    }

    if (typeof title !== "string" || typeof content !== "string") {
      return NextResponse.json(
        { error: "Неверный формат данных" },
        { status: 400 }
      );
    }

    if (title.trim().length === 0 || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Название и контент не могут быть пустыми" },
        { status: 400 }
      );
    }

    // Создаем source
    const source = await prisma.knowledgeSource.create({
      data: {
        knowledgeBaseId,
        type: "MANUAL",
        title: title.trim(),
        metadata: {
          contentLength: content.length,
          category: category || null,
          addedBy: session?.user?.email || "unknown",
        },
        status: "PROCESSING",
        lastFetchedAt: new Date(),
      },
    });

    // Создаем запись документа
    const document = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        sourceId: source.id,
        fileName: null,
        originalName: title.trim(),
        fileType: "text",
        fileSize: Buffer.byteLength(content, "utf8"),
        filePath: null,
        mimeType: "text/plain",
        contentType: "TEXT",
        processingStatus: "QUEUED",
        uploadedByUserId: session?.user?.id ?? null,
        meta: {
          category: category || null,
          textContent: content.trim(), // Сохраняем текст в meta для обработки
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
        status: "PROCESSING",
      },
    });
  } catch (error) {
    console.error("[admin/knowledge-bases/text] POST error:", error);
    return NextResponse.json(
      { error: "Не удалось добавить текст" },
      { status: 500 }
    );
  }
}

