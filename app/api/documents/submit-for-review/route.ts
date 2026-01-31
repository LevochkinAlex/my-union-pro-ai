import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/documents/submit-for-review
 * Отправка заявлений на проверку по явному действию пользователя (кнопка «Отправить на проверку»).
 * Переводит оба заявления из SIGNED в PENDING_REVIEW и пользователя в DOCUMENTS_PENDING.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const membershipDoc = await prisma.document.findFirst({
      where: {
        userId: session.user.id,
        type: "MEMBERSHIP_APPLICATION",
        status: "SIGNED",
        signedFilePath: { not: null },
      },
    });

    const contributionDoc = await prisma.document.findFirst({
      where: {
        userId: session.user.id,
        type: "CONTRIBUTION_APPLICATION",
        status: "SIGNED",
        signedFilePath: { not: null },
      },
    });

    if (!membershipDoc || !contributionDoc) {
      return NextResponse.json(
        { error: "Оба заявления должны быть загружены перед отправкой на проверку" },
        { status: 400 }
      );
    }

    await prisma.document.updateMany({
      where: {
        userId: session.user.id,
        type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
        status: "SIGNED",
      },
      data: { status: "PENDING_REVIEW" },
    });

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { membershipStatus: true },
    });

    if (
      currentUser &&
      currentUser.membershipStatus !== "APPROVED" &&
      currentUser.membershipStatus !== "REJECTED"
    ) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { membershipStatus: "DOCUMENTS_PENDING" },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Документы отправлены на проверку",
    });
  } catch (error) {
    console.error("[documents/submit-for-review] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке документов на проверку" },
      { status: 500 }
    );
  }
}
