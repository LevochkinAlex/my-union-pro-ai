import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ProcessingStatus } from "@prisma/client";
import { ensureSuperAdmin } from "@/lib/admin-auth";

// GET - список баз знаний
export async function GET() {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const knowledgeBases = await prisma.knowledgeBase.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            documents: true,
            bots: true,
            sources: true,
          },
        },
      },
    });

    const knowledgeBaseIds = knowledgeBases.map((kb) => kb.id);

    const statusGroups = await prisma.knowledgeDocument.groupBy({
      by: ["knowledgeBaseId", "processingStatus"],
      _count: {
        _all: true,
      },
      where: {
        knowledgeBaseId: { in: knowledgeBaseIds },
      },
    });

    const latestProcessed = await prisma.knowledgeDocument.findMany({
      where: {
        knowledgeBaseId: { in: knowledgeBaseIds },
        processedAt: { not: null },
      },
      select: {
        knowledgeBaseId: true,
        processedAt: true,
      },
      orderBy: {
        processedAt: "desc",
      },
    });

    const statusMap = new Map<string, Partial<Record<ProcessingStatus, number>>>();
    statusGroups.forEach((group) => {
      const entry = statusMap.get(group.knowledgeBaseId) ?? {};
      entry[group.processingStatus] = group._count._all;
      statusMap.set(group.knowledgeBaseId, entry);
    });

    const latestMap = new Map<string, Date>();
    latestProcessed.forEach((row) => {
      if (!latestMap.has(row.knowledgeBaseId) && row.processedAt) {
        latestMap.set(row.knowledgeBaseId, row.processedAt);
      }
    });

    const enriched = knowledgeBases.map((kb) => {
      const counts = statusMap.get(kb.id) ?? {};
      const queued = counts.QUEUED ?? 0;
      const processing = counts.PROCESSING ?? 0;
      const completed = counts.COMPLETED ?? 0;
      const failed = counts.FAILED ?? 0;

      return {
        ...kb,
        stats: {
          total: kb._count.documents,
          queued,
          processing,
          completed,
          failed,
          lastProcessedAt: latestMap.get(kb.id)?.toISOString() ?? null,
        },
      };
    });

    return NextResponse.json({ knowledgeBases: enriched });
  } catch (error) {
    console.error("[admin/knowledge-bases] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить базы знаний" },
      { status: 500 }
    );
  }
}

// POST - создание базы знаний
export async function POST(request: NextRequest) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const { name, description, isActive = true } = await request.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Название базы знаний обязательно" },
        { status: 400 }
      );
    }

    const knowledgeBase = await prisma.knowledgeBase.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        isActive: Boolean(isActive),
      },
      include: {
        _count: {
          select: {
            documents: true,
            bots: true,
            sources: true,
          },
        },
      },
    });

    return NextResponse.json({
      knowledgeBase: {
        ...knowledgeBase,
        stats: {
          total: knowledgeBase._count.documents,
          queued: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          lastProcessedAt: null,
        },
      },
    });
  } catch (error: unknown) {
    console.error("[admin/knowledge-bases] POST error:", error);
    return NextResponse.json(
      { error: "Не удалось создать базу знаний" },
      { status: 500 }
    );
  }
}

