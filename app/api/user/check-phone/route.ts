import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils/phone";

/**
 * POST /api/user/check-phone
 * Проверяет, привязан ли телефон к другому аккаунту
 * Возвращает данные связанного аккаунта для возможного слияния
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { error: "Номер телефона не указан" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Некорректный номер телефона" },
        { status: 400 }
      );
    }

    // Получаем текущего пользователя
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        phone: true,
        authPhone: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        dateOfBirth: true,
        address: true,
        jobTitle: true,
        profession: true,
        education: true,
        avatarUrl: true,
        membershipStatus: true,
        unionCardNumber: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Если это тот же номер - ничего не делаем
    if (normalizedPhone === currentUser.phone) {
      return NextResponse.json({
        status: "same",
        message: "Этот номер уже привязан к вашему аккаунту",
      });
    }

    // Ищем пользователя с таким номером
    const existingUser = await prisma.user.findFirst({
      where: {
        id: { not: session.user.id },
        OR: [
          { phone: normalizedPhone },
          { authPhone: normalizedPhone },
        ],
      },
      select: {
        id: true,
        phone: true,
        authPhone: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        dateOfBirth: true,
        address: true,
        jobTitle: true,
        profession: true,
        education: true,
        avatarUrl: true,
        membershipStatus: true,
        unionCardNumber: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });

    if (!existingUser) {
      // Номер свободен
      return NextResponse.json({
        status: "available",
        message: "Номер свободен и может быть привязан",
        phone: normalizedPhone,
      });
    }

    // Номер занят - возвращаем данные для слияния
    return NextResponse.json({
      status: "conflict",
      message: "Этот номер привязан к другому аккаунту",
      phone: normalizedPhone,
      currentAccount: {
        id: currentUser.id,
        phone: currentUser.phone,
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        middleName: currentUser.middleName,
        dateOfBirth: currentUser.dateOfBirth,
        address: currentUser.address,
        jobTitle: currentUser.jobTitle,
        profession: currentUser.profession,
        education: currentUser.education,
        avatarUrl: currentUser.avatarUrl,
        membershipStatus: currentUser.membershipStatus,
        unionCardNumber: currentUser.unionCardNumber,
        organizationName: currentUser.organization?.name,
        createdAt: currentUser.createdAt,
      },
      existingAccount: {
        id: existingUser.id,
        phone: existingUser.phone,
        email: existingUser.email,
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        middleName: existingUser.middleName,
        dateOfBirth: existingUser.dateOfBirth,
        address: existingUser.address,
        jobTitle: existingUser.jobTitle,
        profession: existingUser.profession,
        education: existingUser.education,
        avatarUrl: existingUser.avatarUrl,
        membershipStatus: existingUser.membershipStatus,
        unionCardNumber: existingUser.unionCardNumber,
        organizationName: existingUser.organization?.name,
        createdAt: existingUser.createdAt,
        documentsCount: existingUser._count.documents,
      },
      canMerge: true,
    });
  } catch (error) {
    console.error("[check-phone] Error:", error);
    return NextResponse.json(
      { error: "Не удалось проверить номер" },
      { status: 500 }
    );
  }
}

