import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserKnowledgeBase, saveUserProfileToKnowledgeBase } from "@/lib/user-knowledge-base";
import { generateEmbedding } from "@/lib/knowledge/embeddings";

// GET - получить базу знаний пользователя
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await context.params;

    // Получаем базу знаний пользователя
    const userKB = await prisma.userKnowledgeBase.findUnique({
      where: { userId },
      include: {
        chunks: {
          orderBy: { createdAt: "desc" },
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!userKB) {
      // Создаем базу знаний если её нет
      const newKB = await getOrCreateUserKnowledgeBase(userId);
      return NextResponse.json({
        id: newKB.id,
        userId,
        chunks: [],
        createdAt: newKB.createdAt,
        updatedAt: newKB.updatedAt,
      });
    }

    // Форматируем chunks для отображения
    const formattedChunks = userKB.chunks.map((chunk) => ({
      id: chunk.id,
      type: chunk.type,
      content: chunk.content,
      source: chunk.source,
      relatedEntityType: chunk.relatedEntityType,
      relatedEntityId: chunk.relatedEntityId,
      tokens: chunk.tokens,
      metadata: chunk.metadata,
      createdAt: chunk.createdAt,
    }));

    return NextResponse.json({
      id: userKB.id,
      userId,
      user: userKB.user,
      chunks: formattedChunks,
      chunksCount: formattedChunks.length,
      createdAt: userKB.createdAt,
      updatedAt: userKB.updatedAt,
    });
  } catch (error) {
    console.error("[admin/users/knowledge] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user knowledge base" },
      { status: 500 }
    );
  }
}

// POST - добавить новый chunk в базу знаний
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await context.params;
    const { type, content, source } = await request.json();

    if (!type || !content) {
      return NextResponse.json(
        { error: "Type and content are required" },
        { status: 400 }
      );
    }

    // Получаем или создаем базу знаний
    const userKB = await getOrCreateUserKnowledgeBase(userId);

    // Генерируем embedding
    const embedding = await generateEmbedding(content);

    // Создаем chunk
    const chunk = await prisma.userKnowledgeChunk.create({
      data: {
        userKnowledgeBaseId: userKB.id,
        type,
        content,
        embedding: embedding || [],
        source: source || "admin_manual",
        tokens: Math.ceil(content.length / 4),
        metadata: {
          addedBy: session.user.email,
          addedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      chunk: {
        id: chunk.id,
        type: chunk.type,
        content: chunk.content,
        source: chunk.source,
        createdAt: chunk.createdAt,
      },
    });
  } catch (error) {
    console.error("[admin/users/knowledge] POST Error:", error);
    return NextResponse.json(
      { error: "Failed to add knowledge chunk" },
      { status: 500 }
    );
  }
}

// DELETE - удалить chunk из базы знаний
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chunkId = searchParams.get("chunkId");

    if (!chunkId) {
      return NextResponse.json(
        { error: "Chunk ID is required" },
        { status: 400 }
      );
    }

    await prisma.userKnowledgeChunk.delete({
      where: { id: chunkId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/users/knowledge] DELETE Error:", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge chunk" },
      { status: 500 }
    );
  }
}

// PUT - обновить профиль в базе знаний (пересинхронизировать)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await context.params;

    // Получаем пользователя с организацией
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Пересохраняем профиль в базу знаний
    await saveUserProfileToKnowledgeBase(user);

    return NextResponse.json({
      success: true,
      message: "User profile synced to knowledge base",
    });
  } catch (error) {
    console.error("[admin/users/knowledge] PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to sync user profile" },
      { status: 500 }
    );
  }
}
