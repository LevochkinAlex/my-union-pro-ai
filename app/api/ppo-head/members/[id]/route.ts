import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * GET /api/ppo-head/members/[id]
 * Получить полную информацию о члене профсоюза
 */
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
    const memberId = resolvedParams.id;

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const member = await prisma.user.findFirst({
      where: {
        id: memberId,
        organizationId: chairman.organizationId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        authPhone: true,
        dateOfBirth: true,
        address: true,
        avatarUrl: true,
        jobTitle: true,
        profession: true,
        education: true,
        workplace: true,
        workplaceInn: true,
        directorName: true,
        directorPosition: true,
        employmentStatus: true,
        role: true,
        membershipStatus: true,
        unionCardNumber: true,
        membershipJoinedAt: true,
        unionMembershipStatus: true,
        awards: true,
        aboutMe: true,
        hobbies: true,
        maritalStatus: true,
        spouseInfo: true,
        hasChildren: true,
        childrenInfo: true,
        childrenBirthDates: true,
        training: true,
        additionalInfo: true,
        professions: true,
        educations: true,
        preferredDiscountCity: true,
        bestBenefitsUserId: true,
        bestBenefitsStatus: true,
        createdAt: true,
        updatedAt: true,
        emailVerified: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        documents: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            fileName: true,
            filePath: true,
            signedFilePath: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        membershipHistory: {
          orderBy: { createdAt: "desc" },
          include: {
            organization: true,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Член профсоюза не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json({ member });
  } catch (error: any) {
    console.error("[ppo-head/members/[id]] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении данных члена профсоюза",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

