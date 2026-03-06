import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { isMemberOfOrganization } from "@/lib/ppo-head-utils";

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

    const perm = await checkUserPermissions(session.user.id, "members_view");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        { error: "Нет доступа к данным членов профсоюза" },
        { status: 403 }
      );
    }

    const member = await prisma.user.findFirst({
      where: {
        id: memberId,
        organizationId: perm.organizationId,
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

/**
 * PATCH /api/ppo-head/members/[id]
 * Редактирование данных члена (например дата вступления). Доступно председателю ППО.
 * При изменении даты вступления у пользователя ставится флаг необходимости перегенерации заявлений.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "members_edit");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        { error: "Нет прав на редактирование данных членов профсоюза" },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const memberId = resolvedParams.id;

    const belongs = await isMemberOfOrganization(memberId, perm.organizationId);
    if (!belongs) {
      return NextResponse.json(
        { error: "Член профсоюза не принадлежит вашей организации" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const membershipJoinedAtRaw = body.membershipJoinedAt;

    if (membershipJoinedAtRaw === undefined || membershipJoinedAtRaw === null) {
      return NextResponse.json(
        { error: "Укажите membershipJoinedAt (дата вступления)" },
        { status: 400 }
      );
    }

    const parsed = new Date(membershipJoinedAtRaw);
    if (isNaN(parsed.getTime()) || parsed > new Date()) {
      return NextResponse.json(
        { error: "Некорректная дата вступления" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: memberId },
      data: {
        membershipJoinedAt: parsed,
        profileChangedAfterDocuments: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Дата вступления обновлена. Потребуется перегенерировать заявления участника.",
    });
  } catch (error: any) {
    console.error("[ppo-head/members/[id]] PATCH error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при обновлении данных члена",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

