/**
 * API для управления сотрудниками организации
 * GET /api/ppo-head/staff - список сотрудников
 * POST /api/ppo-head/staff - добавление сотрудника (приглашение)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

// Генерация временного пароля
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Генерация токена приглашения
function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

// GET - список сотрудников
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    let organizationId: string | null = null;

    if (user?.isPPOHead && user.ppoHeadOrganizationId) {
      organizationId = user.ppoHeadOrganizationId;
    } else {
      // Проверяем права сотрудника
      const staffPosition = await prisma.organizationStaff.findFirst({
        where: {
          userId: session.user.id,
          status: "ACTIVE",
        },
        include: { role: true },
      });

      if (staffPosition) {
        const permissions = staffPosition.role.permissions as any;
        if (permissions?.staff_view) {
          organizationId = staffPosition.organizationId;
        }
      }
    }

    if (!organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // PENDING, ACTIVE, INACTIVE
    const roleId = searchParams.get("roleId");

    const staff = await prisma.organizationStaff.findMany({
      where: {
        organizationId,
        ...(status && { status: status as any }),
        ...(roleId && { roleId }),
      },
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
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ staff });
  } catch (error) {
    console.error("[API] Error fetching staff:", error);
    return NextResponse.json(
      { error: "Ошибка при получении списка сотрудников" },
      { status: 500 }
    );
  }
}

// POST - добавить сотрудника (приглашение)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    if (!user?.isPPOHead || !user.ppoHeadOrganizationId) {
      return NextResponse.json(
        { error: "Только Председатель может добавлять сотрудников" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, email, roleId } = body;

    if (!roleId) {
      return NextResponse.json(
        { error: "Роль обязательна" },
        { status: 400 }
      );
    }

    // Проверяем что роль существует и принадлежит организации
    const role = await prisma.staffRole.findFirst({
      where: {
        id: roleId,
        organizationId: user.ppoHeadOrganizationId,
        isActive: true,
      },
    });

    if (!role) {
      return NextResponse.json(
        { error: "Роль не найдена или недоступна" },
        { status: 404 }
      );
    }

    // Получаем информацию об организации
    const organization = await prisma.organization.findUnique({
      where: { id: user.ppoHeadOrganizationId },
      select: { name: true },
    });

    // Вариант 1: Добавляем существующего пользователя по ID
    if (userId) {
      // Проверяем что пользователь существует
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: "Пользователь не найден" },
          { status: 404 }
        );
      }

      // Проверяем что пользователь еще не является сотрудником
      const existingStaff = await prisma.organizationStaff.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: user.ppoHeadOrganizationId,
          },
        },
      });

      if (existingStaff) {
        return NextResponse.json(
          { error: "Пользователь уже является сотрудником организации" },
          { status: 400 }
        );
      }

      const inviteToken = generateInviteToken();

      const staff = await prisma.organizationStaff.create({
        data: {
          userId,
          organizationId: user.ppoHeadOrganizationId,
          roleId,
          status: "PENDING",
          inviteToken,
          inviteExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 дней
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          role: {
            select: { name: true },
          },
        },
      });

      // TODO: Отправить уведомление пользователю
      // await sendStaffInviteNotification(targetUser.email, {
      //   organizationName: organization?.name,
      //   roleName: role.name,
      //   inviteToken,
      // });

      return NextResponse.json(
        {
          staff,
          message: `Приглашение отправлено пользователю ${targetUser.firstName} ${targetUser.lastName}`,
        },
        { status: 201 }
      );
    }

    // Вариант 2: Приглашаем нового пользователя по email
    if (email) {
      // Проверяем, существует ли пользователь с таким email
      let targetUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      const tempPassword = generateTempPassword();
      const inviteToken = generateInviteToken();

      // Если пользователя нет, создаем его
      if (!targetUser) {
        targetUser = await prisma.user.create({
          data: {
            email,
            password: await bcrypt.hash(tempPassword, 10),
            role: "MEMBER",
            membershipStatus: "PROFILE_INCOMPLETE",
            emailVerified: new Date(), // Считаем email подтвержденным через приглашение
          },
          select: { id: true },
        });
      }

      // Проверяем что пользователь не является уже сотрудником
      const existingStaff = await prisma.organizationStaff.findUnique({
        where: {
          userId_organizationId: {
            userId: targetUser.id,
            organizationId: user.ppoHeadOrganizationId,
          },
        },
      });

      if (existingStaff) {
        return NextResponse.json(
          { error: "Пользователь уже является сотрудником организации" },
          { status: 400 }
        );
      }

      const staff = await prisma.organizationStaff.create({
        data: {
          userId: targetUser.id,
          organizationId: user.ppoHeadOrganizationId,
          roleId,
          status: "PENDING",
          inviteToken,
          inviteExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          tempPassword: await bcrypt.hash(tempPassword, 10),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          role: {
            select: { name: true },
          },
        },
      });

      // Сохраняем приглашение для истории
      await prisma.staffInvitation.create({
        data: {
          organizationId: user.ppoHeadOrganizationId,
          email,
          roleId,
          token: inviteToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: "pending",
          invitedByUserId: user.id,
        },
      });

      // TODO: Отправить email с приглашением и временным паролем
      // await sendStaffInviteEmail(email, {
      //   organizationName: organization?.name,
      //   roleName: role.name,
      //   tempPassword,
      //   inviteLink: `${process.env.NEXTAUTH_URL}/auth/staff-invite/${inviteToken}`,
      // });

      return NextResponse.json(
        {
          staff,
          tempPassword, // Возвращаем для отображения Председателю (один раз)
          message: `Приглашение отправлено на ${email}`,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { error: "Укажите userId или email" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[API] Error creating staff:", error);
    return NextResponse.json(
      { error: "Ошибка при добавлении сотрудника" },
      { status: 500 }
    );
  }
}
