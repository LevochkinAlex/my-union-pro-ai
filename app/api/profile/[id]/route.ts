import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - получение публичного профиля пользователя
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const userId = resolvedParams.id;

    if (!userId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        avatarUrl: true,
        phone: true,
        jobTitle: true,
        profession: true,
        education: true,
        aboutMe: true,
        hobbies: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Проверяем, является ли это профиль текущего пользователя
    const isOwnProfile = user.id === session.user.id;

    return NextResponse.json({
      ...user,
      isOwnProfile,
    });
  } catch (error) {
    console.error("[profile] GET Error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
