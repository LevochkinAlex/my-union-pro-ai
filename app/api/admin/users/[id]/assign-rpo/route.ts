import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";

/**
 * POST /api/admin/users/[id]/assign-rpo
 * Суперадмин назначает пользователя председателем РПО (региональной организации).
 * При необходимости одобряет членство (membershipStatus → APPROVED).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) return error;

    const resolvedParams = await Promise.resolve(params);
    const userId = resolvedParams.id;

    if (!userId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    const body = await request.json();
    const { organizationId, chairmanJobTitle, approveMembership } = body as {
      organizationId: string;
      chairmanJobTitle?: string | null;
      approveMembership?: boolean;
    };

    if (!organizationId) {
      return NextResponse.json({ error: "Не указана организация РПО" }, { status: 400 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, type: true },
    });

    if (!organization) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    if (organization.type !== "REGIONAL") {
      return NextResponse.json(
        { error: "Можно назначить только председателем региональной организации (РПО)" },
        { status: 400 }
      );
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
      // Снимаем предыдущего председателя этой РПО
      const previous = await tx.user.findFirst({
        where: { rpoHeadOrganizationId: organization.id, id: { not: userId } },
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

      // Назначаем нового председателя
      const updateData: {
        isRPOHead: boolean;
        rpoHeadOrganizationId: string;
        viewMode: string;
        membershipStatus?: "APPROVED";
        role?: "MEMBER";
      } = {
        isRPOHead: true,
        rpoHeadOrganizationId: organization.id,
        viewMode: "RPO_HEAD",
      };

      if (approveMembership) {
        updateData.membershipStatus = "APPROVED";
        // При одобрении переводим в обычного члена, чтобы был доступ к "режиму участника"
        // и всем пользовательским разделам.
        if (user.role === "PENDING_MEMBER") {
          updateData.role = "MEMBER";
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

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
      organizationId: organization.id,
      organizationName: organization.name,
      userId,
      message: "Пользователь назначен председателем РПО",
    });
  } catch (err) {
    console.error("[admin/users/assign-rpo] Error:", err);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]/assign-rpo
 * Суперадмин снимает пользователя с должности председателя РПО.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) return error;

    const resolvedParams = await Promise.resolve(params);
    const userId = resolvedParams.id;

    if (!userId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isRPOHead: true, rpoHeadOrganizationId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (!user.isRPOHead || !user.rpoHeadOrganizationId) {
      return NextResponse.json(
        { error: "Пользователь не является председателем РПО" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          isRPOHead: false,
          rpoHeadOrganizationId: null,
          viewMode: "MEMBER",
        },
      }),
      prisma.organization.update({
        where: { id: user.rpoHeadOrganizationId },
        data: { chairmanName: null, chairmanJobTitle: null },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Пользователь снят с должности председателя РПО",
    });
  } catch (err) {
    console.error("[admin/users/assign-rpo] DELETE Error:", err);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
