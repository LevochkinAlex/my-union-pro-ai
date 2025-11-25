import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Доступ запрещён" },
        { status: 403 }
      );
    }

    // Получаем последние 50 сессий STATEMENT с количеством сообщений
    const sessions = await prisma.chatSession.findMany({
      where: {
        type: "STATEMENT",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          select: {
            id: true,
          },
        },
      },
    });

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        type: s.type,
        createdAt: s.createdAt,
        user: s.user,
        messages: s.messages,
      })),
    });
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    return NextResponse.json(
      { error: "Ошибка загрузки сессий" },
      { status: 500 }
    );
  }
}

