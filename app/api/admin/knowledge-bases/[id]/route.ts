import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";

// GET - получение базы знаний
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        documents: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            fileName: true,
            originalName: true,
            fileType: true,
            fileSize: true,
            contentType: true,
            processingStatus: true,
            processedAt: true,
            createdAt: true,
            meta: true,
            knowledgeBaseId: true,
            sourceId: true,
          },
        },
        sources: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            type: true,
            status: true,
            metadata: true,
            lastFetchedAt: true,
            createdAt: true,
          },
        },
        bots: {
          include: {
            chatBot: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            documents: true,
            sources: true,
            bots: true,
          },
        },
      },
    });

    if (!knowledgeBase) {
      return NextResponse.json(
        { error: "База знаний не найдена" },
        { status: 404 }
      );
    }

    return NextResponse.json({ knowledgeBase });
  } catch (error) {
    console.error("[admin/knowledge-bases] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить базу знаний" },
      { status: 500 }
    );
  }
}

// PUT - обновление базы знаний
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    const { name, description, isActive } = await request.json();

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Название не может быть пустым" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const knowledgeBase = await prisma.knowledgeBase.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ knowledgeBase });
  } catch (error) {
    console.error("[admin/knowledge-bases] PUT error:", error);
    return NextResponse.json(
      { error: "Не удалось обновить базу знаний" },
      { status: 500 }
    );
  }
}

// DELETE - удаление базы знаний
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    await prisma.knowledgeBase.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/knowledge-bases] DELETE error:", error);
    return NextResponse.json(
      { error: "Не удалось удалить базу знаний" },
      { status: 500 }
    );
  }
}

