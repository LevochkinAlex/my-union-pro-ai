import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateContributionsApplication } from "@/lib/documents";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Получаем пользователя с организацией
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        organization: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем, что профиль заполнен
    if (!user.firstName || !user.lastName) {
      return NextResponse.json(
        { error: "Профиль не заполнен полностью" },
        { status: 400 }
      );
    }

    // Получаем председателя ППО из организации или используем значение по умолчанию
    const ppoChairman = user.organization?.chairmanName || "Председатель ППО";

    // Генерируем заявление
    const filePath = await generateContributionsApplication(user, ppoChairman);

    // Сохраняем документ в базе данных
    const document = await prisma.document.create({
      data: {
        type: "CONTRIBUTION_APPLICATION",
        status: "DRAFT",
        title: "Заявление о взносах",
        filePath: filePath,
        userId: user.id,
        organizationId: user.organizationId || null,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        filePath: document.filePath,
        type: document.type,
      },
    });
  } catch (error) {
    console.error("[documents/generate-contributions] Ошибка:", error);
    return NextResponse.json(
      { error: "Не удалось сгенерировать заявление" },
      { status: 500 }
    );
  }
}

