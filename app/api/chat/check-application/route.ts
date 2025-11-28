import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isProfileComplete } from "@/lib/profile-extraction";

export async function GET(request: NextRequest) {
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
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем заполненность профиля
    const profileComplete = isProfileComplete(user);

    // Проверяем наличие сгенерированных документов
    const generatedDocuments = await prisma.document.findMany({
      where: {
        userId: session.user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
        status: "GENERATED",
      },
    });

    const hasMembershipGenerated = generatedDocuments.some(d => d.type === "MEMBERSHIP_APPLICATION");
    const hasContributionGenerated = generatedDocuments.some(d => d.type === "CONTRIBUTION_APPLICATION");
    const hasGeneratedDocuments = hasMembershipGenerated || hasContributionGenerated;

    // Проверяем наличие ПОДПИСАННЫХ документов (для активации AI-чата)
    const signedDocuments = await prisma.document.findMany({
      where: {
        userId: session.user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
        status: {
          in: ["SIGNED", "PENDING", "APPROVED"],
        },
      },
    });

    const hasMembershipSigned = signedDocuments.some(d => d.type === "MEMBERSHIP_APPLICATION");
    const hasContributionSigned = signedDocuments.some(d => d.type === "CONTRIBUTION_APPLICATION");
    const hasSignedDocuments = hasMembershipSigned && hasContributionSigned;

    // Чат активируется когда ОБА документа подписаны и отправлены на проверку
    const applicationFilled = hasSignedDocuments;

    return NextResponse.json({
      applicationFilled,
      profileComplete,
      hasGeneratedDocuments,
      hasSignedDocuments,
      hasMembershipGenerated,
      hasContributionGenerated,
      hasMembershipSigned,
      hasContributionSigned,
    });
  } catch (error) {
    console.error("[check-application] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при проверке заявления" },
      { status: 500 }
    );
  }
}

