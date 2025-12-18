import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users/search?email=xxx&phone=xxx
// Поиск пользователя по email или телефону для назначения председателем
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Недостаточно прав" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim().toLowerCase();
    const phone = searchParams.get("phone")?.trim();

    if (!email && !phone) {
      return NextResponse.json(
        { error: "Необходимо указать email или телефон" },
        { status: 400 }
      );
    }

    // Нормализуем телефон (убираем все кроме цифр)
    const normalizedPhone = phone ? phone.replace(/\D/g, "") : null;

    // Ищем пользователя
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email: email }] : []),
          ...(normalizedPhone ? [
            { phone: { contains: normalizedPhone } },
            { authPhone: { contains: normalizedPhone } }
          ] : []),
        ],
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
        jobTitle: true,
        role: true,
        membershipStatus: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
        ppoHeadOrganization: {
          select: {
            id: true,
            name: true,
          }
        },
        organization: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    });

    if (!user) {
      return NextResponse.json({
        found: false,
        user: null,
      });
    }

    // Формируем ФИО
    const fullName = [user.lastName, user.firstName, user.middleName]
      .filter(Boolean)
      .join(" ");

    return NextResponse.json({
      found: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        fullName: fullName || null,
        avatarUrl: user.avatarUrl,
        jobTitle: user.jobTitle,
        role: user.role,
        membershipStatus: user.membershipStatus,
        isPPOHead: user.isPPOHead,
        currentPPOOrganization: user.ppoHeadOrganization,
        memberOrganization: user.organization,
      },
    });
  } catch (error) {
    console.error("[admin/users/search] Error:", error);
    return NextResponse.json(
      { error: "Ошибка поиска пользователя" },
      { status: 500 }
    );
  }
}

