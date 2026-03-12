import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAssignHeadByOrganizationType, getOrgHeadScope } from "@/lib/org-head-permissions";

type Body = {
  userId?: string;
  chairmanJobTitle?: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id: organizationId } = await context.params;
    const { userId, chairmanJobTitle } = (await request.json()) as Body;
    if (!userId) {
      return NextResponse.json({ error: "Не указан пользователь" }, { status: 400 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope || !scope.organizationIds.includes(organizationId)) {
      return NextResponse.json({ error: "Нет доступа к организации" }, { status: 403 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });
    if (!organization) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    const targetRole = canAssignHeadByOrganizationType(organization.type);
    if (!targetRole) {
      return NextResponse.json({ error: "Для данного типа организации назначение не поддерживается" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        role: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const chairmanName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ").trim();

    await prisma.$transaction(async (tx) => {
      if (targetRole === "PPO_HEAD") {
        const previous = await tx.user.findFirst({
          where: { ppoHeadOrganizationId: organization.id, id: { not: user.id } },
          select: { id: true },
        });
        if (previous) {
          await tx.user.update({
            where: { id: previous.id },
            data: {
              isPPOHead: false,
              ppoHeadOrganizationId: null,
              viewMode: "MEMBER",
            },
          });
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            role: "PPO_HEAD",
            isPPOHead: true,
            ppoHeadOrganizationId: organization.id,
            // Председатель ППО должен быть членом той же ППО.
            organizationId: organization.id,
            organizationName: null,
            membershipStatus: "APPROVED",
            unionMembershipStatus: "ACCEPTED",
            viewMode: "PPO_HEAD",
          },
        });
      } else if (targetRole === "MPO_HEAD") {
        const previous = await tx.user.findFirst({
          where: { mpoHeadOrganizationId: organization.id, id: { not: user.id } },
          select: { id: true },
        });
        if (previous) {
          await tx.user.update({
            where: { id: previous.id },
            data: {
              isMPOHead: false,
              mpoHeadOrganizationId: null,
              viewMode: "MEMBER",
            },
          });
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            isMPOHead: true,
            mpoHeadOrganizationId: organization.id,
            viewMode: "MPO_HEAD",
          },
        });
      } else if (targetRole === "RPO_HEAD") {
        const previous = await tx.user.findFirst({
          where: { rpoHeadOrganizationId: organization.id, id: { not: user.id } },
          select: { id: true },
        });
        if (previous) {
          await tx.user.update({
            where: { id: previous.id },
            data: {
              isRPOHead: false,
              rpoHeadOrganizationId: null,
              viewMode: "MEMBER",
            },
          });
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            isRPOHead: true,
            rpoHeadOrganizationId: organization.id,
            viewMode: "RPO_HEAD",
          },
        });
      }

      await tx.organization.update({
        where: { id: organization.id },
        data: {
          chairmanName: chairmanName || null,
          chairmanJobTitle: chairmanJobTitle?.trim() || null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      roleAssigned: targetRole,
      organizationId: organization.id,
      userId: user.id,
    });
  } catch (error: any) {
    console.error("[org-head/organizations/[id]/assign-head] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка назначения председателя",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
