import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMembershipRemovalApplication } from "@/lib/pdf/templates/membershipRemovalApplication";
import type { UserData } from "@/lib/pdf/generator";

/**
 * POST /api/profile/membership/generate-removal
 * Генерирует заявление о снятии с учета
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем данные пользователя
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Проверяем, что пользователь является членом профсоюза
    if (user.unionMembershipStatus !== "ACCEPTED") {
      return NextResponse.json(
        { error: "Вы не являетесь членом профсоюза" },
        { status: 400 }
      );
    }

    // Проверяем наличие всех обязательных данных
    if (
      !user.firstName ||
      !user.lastName ||
      !user.dateOfBirth ||
      !user.address ||
      !user.phone ||
      !user.jobTitle ||
      !user.profession ||
      !user.education ||
      !user.organization
    ) {
      return NextResponse.json(
        { error: "Профиль не полностью заполнен. Пожалуйста, заполните все обязательные поля." },
        { status: 400 }
      );
    }

    const userData: UserData = {
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName || undefined,
      dateOfBirth: user.dateOfBirth.toISOString(),
      address: user.address,
      phone: user.phone,
      jobTitle: user.jobTitle,
      profession: user.profession,
      education: user.education,
      organizationName: user.organization.name,
      organizationInn: user.organization.inn || undefined,
    };

    // Генерируем PDF
    const pdfBuffer = await generateMembershipRemovalApplication(userData);

    // Сохраняем документ в БД
    const document = await prisma.document.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        type: "MEMBERSHIP_REMOVAL_APPLICATION",
        status: "GENERATED",
        title: "Заявление о снятии с учета в профсоюзе",
        description: `Заявление о снятии с учета от ${userData.lastName} ${userData.firstName}`,
        fileName: `membership_removal_${user.id}_${Date.now()}.pdf`,
        fileSize: pdfBuffer.length,
        mimeType: "application/pdf",
        content: Buffer.from(pdfBuffer).toString("base64"),
      },
    });

    // Записываем в историю членства
    await prisma.membershipHistory.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        status: "REMOVED",
        statusDate: new Date(),
        notes: "Заявление о снятии с учета сгенерировано",
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        fileName: document.fileName,
      },
    });
  } catch (error) {
    console.error("[profile/membership/generate-removal] POST error:", error);
    return NextResponse.json(
      { error: "Не удалось сгенерировать заявление" },
      { status: 500 }
    );
  }
}

