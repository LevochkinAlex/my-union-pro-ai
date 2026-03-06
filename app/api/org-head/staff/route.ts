/**
 * API для управления сотрудниками в контуре РПО (все подчинённые организации)
 * GET /api/org-head/staff - список сотрудников по всем ППО в scope
 * POST /api/org-head/staff - приглашение сотрудника в выбранную организацию
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendUserNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";
import type { StaffStatus } from "@prisma/client";

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status = statusParam === "PENDING" || statusParam === "ACTIVE" || statusParam === "INACTIVE"
      ? (statusParam as StaffStatus)
      : null;
    const organizationId = searchParams.get("organizationId")?.trim() || null;

    const where: { organizationId: { in: string[] } | string; status?: StaffStatus } = {
      organizationId: { in: scope.organizationIds },
    };
    if (status) where.status = status;
    if (organizationId && scope.organizationIds.includes(organizationId)) {
      where.organizationId = organizationId as any;
    }

    const staff = await prisma.organizationStaff.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
        role: {
          select: { id: true, name: true, permissions: true },
        },
        organization: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      staff: staff.map((item) => {
        const role = item.role;
        return {
          ...item,
          role: role
            ? { ...role, permissions: normalizeStaffPermissions(role.permissions) }
            : (null as unknown as { id: string; name: string; permissions: ReturnType<typeof normalizeStaffPermissions> }),
        };
      }),
      scope: "rpo",
    });
  } catch (error) {
    console.error("[org-head/staff] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении списка сотрудников" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, email, roleId, organizationId } = body;

    if (!roleId || !organizationId) {
      return NextResponse.json(
        { error: "Укажите организацию и роль" },
        { status: 400 }
      );
    }

    if (!scope.organizationIds.includes(organizationId)) {
      return NextResponse.json({ error: "Организация недоступна" }, { status: 403 });
    }

    const role = await prisma.staffRole.findFirst({
      where: { id: roleId, organizationId, isActive: true },
    });
    if (!role) {
      return NextResponse.json({ error: "Роль не найдена в этой организации" }, { status: 404 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    if (userId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (!targetUser) {
        return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
      }

      const existing = await prisma.organizationStaff.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Пользователь уже является сотрудником этой организации" },
          { status: 400 }
        );
      }

      const staff = await prisma.organizationStaff.create({
        data: {
          userId,
          organizationId,
          roleId,
          status: "ACTIVE",
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          role: { select: { name: true } },
          organization: { select: { id: true, name: true } },
        },
      });

      try {
        await sendUserNotification({
          userId: targetUser.id,
          type: "staff_added",
          title: "Вы назначены сотрудником",
          body: `Вы добавлены как "${role.name}" в организацию "${organization?.name || ""}".`,
          url: "/dashboard",
        });
      } catch (_) {}

      return NextResponse.json(
        { staff, message: "Сотрудник добавлен", isExistingUser: true },
        { status: 201 }
      );
    }

    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true, firstName: true, lastName: true },
      });

      if (existingUser) {
        const existing = await prisma.organizationStaff.findUnique({
          where: { userId_organizationId: { userId: existingUser.id, organizationId } },
        });
        if (existing) {
          return NextResponse.json(
            { error: "Этот пользователь уже является сотрудником организации" },
            { status: 400 }
          );
        }

        const staff = await prisma.organizationStaff.create({
          data: {
            userId: existingUser.id,
            organizationId,
            roleId,
            status: "ACTIVE",
          },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            role: { select: { name: true } },
            organization: { select: { id: true, name: true } },
          },
        });

        try {
          await sendUserNotification({
            userId: existingUser.id,
            type: "staff_added",
            title: "Вы назначены сотрудником",
            body: `Вы добавлены как "${role.name}" в организацию "${organization?.name || ""}".`,
            url: "/dashboard",
          });
        } catch (_) {}

        return NextResponse.json(
          { staff, message: "Сотрудник добавлен", isExistingUser: true },
          { status: 201 }
        );
      }

      const inviteToken = generateInviteToken();
      const newUser = await prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          role: "MEMBER",
          membershipStatus: "PROFILE_INCOMPLETE",
          emailVerified: new Date(),
        },
        select: { id: true },
      });

      const staff = await prisma.organizationStaff.create({
        data: {
          userId: newUser.id,
          organizationId,
          roleId,
          status: "PENDING",
          inviteToken,
          inviteExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          role: { select: { name: true } },
          organization: { select: { id: true, name: true } },
        },
      });

      const inviteLink = `${process.env.NEXTAUTH_URL || "https://myunion.pro"}/login?email=${encodeURIComponent(email)}&invite=1`;
      const orgName = organization?.name || "профком";

      try {
        await sendEmail({
          to: email,
          subject: "Приглашение в состав управляющего органа профкома",
          text: `Здравствуйте!\n\nВас приглашают в состав управляющего органа (${orgName}) с ролью «${role.name}».\n\nДля входа перейдите по ссылке (действует 7 дней):\n${inviteLink}\n\n--\nС уважением,\nМойСоюз`,
          html: `<p>Здравствуйте!</p><p>Вас приглашают в состав управляющего органа <strong>${orgName}</strong> с ролью «${role.name}».</p><p><a href="${inviteLink}">Войти в личный кабинет</a></p><p>--<br>МойСоюз</p>`,
        });
      } catch (_) {}

      return NextResponse.json(
        { staff, message: `Приглашение отправлено на ${email}`, isExistingUser: false },
        { status: 201 }
      );
    }

    return NextResponse.json({ error: "Укажите userId или email" }, { status: 400 });
  } catch (error) {
    console.error("[org-head/staff] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при добавлении сотрудника" },
      { status: 500 }
    );
  }
}
