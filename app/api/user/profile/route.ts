import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        middleName: true,
        dateOfBirth: true,
        address: true,
        jobTitle: true,
        profession: true,
        education: true,
        organizationName: true,
        employmentStatus: true,
        maritalStatus: true,
        spouseInfo: true,
        hasChildren: true,
        childrenBirthDates: true,
        hobbies: true,
        aboutMe: true,
        additionalInfo: true,
        preferredDiscountCity: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("[GET /api/user/profile] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении профиля" },
      { status: 500 }
    );
  }
}

