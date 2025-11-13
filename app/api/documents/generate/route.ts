import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMembershipApplication } from "@/lib/pdf/templates/membershipApplication";
import { generateDuesApplication } from "@/lib/pdf/templates/duesApplication";
import type { UserData } from "@/lib/pdf/generator";

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

    // Генерируем оба документа
    const [membershipPdf, duesPdf] = await Promise.all([
      generateMembershipApplication(userData),
      generateDuesApplication(userData),
    ]);

    // Сохраняем документы в БД
    const [membershipDoc, duesDoc] = await Promise.all([
      prisma.document.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          type: "MEMBERSHIP_APPLICATION",
          status: "GENERATED",
          title: "Заявление о вступлении в профсоюз",
          description: `Заявление о вступлении в МООП РЗ от ${userData.lastName} ${userData.firstName}`,
          fileName: `membership_application_${user.id}_${Date.now()}.pdf`,
          fileSize: membershipPdf.length,
          mimeType: "application/pdf",
          content: Buffer.from(membershipPdf).toString("base64"), // Сохраняем как base64
        },
      }),
      prisma.document.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          type: "CONTRIBUTION_APPLICATION",
          status: "GENERATED",
          title: "Заявление о перечислении членских взносов",
          description: `Заявление о взносах от ${userData.lastName} ${userData.firstName}`,
          fileName: `dues_application_${user.id}_${Date.now()}.pdf`,
          fileSize: duesPdf.length,
          mimeType: "application/pdf",
          content: Buffer.from(duesPdf).toString("base64"), // Сохраняем как base64
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      documents: [
        {
          id: membershipDoc.id,
          type: membershipDoc.type,
          title: membershipDoc.title,
          fileName: membershipDoc.fileName,
        },
        {
          id: duesDoc.id,
          type: duesDoc.type,
          title: duesDoc.title,
          fileName: duesDoc.fileName,
        },
      ],
    });
  } catch (error) {
    console.error("Ошибка генерации документов:", error);
    return NextResponse.json(
      { error: "Ошибка при генерации документов. Попробуйте позже." },
      { status: 500 }
    );
  }
}

