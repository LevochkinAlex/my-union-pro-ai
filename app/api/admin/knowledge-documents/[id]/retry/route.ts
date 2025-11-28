import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnowledgeQueue } from "@/lib/queues/knowledgeQueue";
import { ensureSuperAdmin } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const documentId = resolvedParams.id;

    const document = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    const currentMeta =
      document.meta && typeof document.meta === "object" && !Array.isArray(document.meta)
        ? document.meta
        : {};

    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        processingStatus: "QUEUED",
        processedAt: null,
        meta: {
          ...currentMeta,
          retriedAt: new Date().toISOString(),
        },
      },
    });

    if (document.sourceId) {
      await prisma.knowledgeSource.update({
        where: { id: document.sourceId },
        data: {
          status: "PENDING",
          lastFetchedAt: new Date(),
        },
      });
    }

    const queue = getKnowledgeQueue();
    await queue.add("process-document", { documentId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/knowledge-documents/retry] POST error:", error);
    return NextResponse.json({ error: "Не удалось перезапустить обработку" }, { status: 500 });
  }
}
