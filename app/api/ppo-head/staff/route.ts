/**
 * API для управления сотрудниками организации
 * GET /api/ppo-head/staff - список сотрудников
 * POST /api/ppo-head/staff - добавление сотрудника
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendUserNotification } from "@/lib/notifications";

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

      // Пользователь уже в системе - сразу добавляем как активного сотрудника
      const staff = await prisma.organizationStaff.create({
        data: {
          userId,
          organizationId: user.ppoHeadOrganizationId,
          roleId,
          status: "ACTIVE", // Сразу активный, т.к. пользователь уже в системе
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

      // Отправляем уведомление пользователю
      try {
        await sendUserNotification({
          userId: targetUser.id,
          type: "system",
          title: "Вы назначены сотрудником",
          body: `Вы добавлены как "${role.name}" в организацию "${organization?.name || ""}". Новые возможности доступны в вашем личном кабинете.`,
          url: `/dashboard`,
        });
      } catch (notifError) {
        console.error("[API] Failed to send notification:", notifError);
      }

      return NextResponse.json(
        {
          staff,
          message: `${targetUser.firstName || ""} ${targetUser.lastName || ""} добавлен как сотрудник`,
          isExistingUser: true,
        },
        { status: 201 }
      );
    }

    // Вариант 2: Добавляем по email
    if (email) {
      // Проверяем, существует ли пользователь с таким email
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, firstName: true, lastName: true },
      });

      // Если пользователь уже есть - добавляем как активного сотрудника
      if (existingUser) {
        // Проверяем что не является уже сотрудником
        const existingStaff = await prisma.organizationStaff.findUnique({
          where: {
            userId_organizationId: {
              userId: existingUser.id,
              organizationId: user.ppoHeadOrganizationId,
            },
          },
        });

        if (existingStaff) {
          return NextResponse.json(
            { error: "Этот пользователь уже является сотрудником организации" },
            { status: 400 }
          );
        }

        const staff = await prisma.organizationStaff.create({
          data: {
            userId: existingUser.id,
            organizationId: user.ppoHeadOrganizationId,
            roleId,
            status: "ACTIVE",
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

        // Отправляем уведомление
        try {
          await sendUserNotification({
            userId: existingUser.id,
            type: "system",
            title: "Вы назначены сотрудником",
            body: `Вы добавлены как "${role.name}" в организацию "${organization?.name || ""}".`,
            url: `/dashboard`,
          });
        } catch (notifError) {
          console.error("[API] Failed to send notification:", notifError);
        }

        return NextResponse.json(
          {
            staff,
            message: `${existingUser.firstName || ""} ${existingUser.lastName || ""} добавлен как сотрудник`,
            isExistingUser: true,
          },
          { status: 201 }
        );
      }

      // Пользователя нет - создаем приглашение (новый пользователь)
      const inviteToken = generateInviteToken();

      // Создаем нового пользователя БЕЗ пароля (вход по OTP)
      const newUser = await prisma.user.create({
        data: {
          email,
          role: "MEMBER",
          membershipStatus: "PROFILE_INCOMPLETE",
          emailVerified: new Date(),
        },
        select: { id: true },
      });

      const staff = await prisma.organizationStaff.create({
        data: {
          userId: newUser.id,
          organizationId: user.ppoHeadOrganizationId,
          roleId,
          status: "PENDING",
          inviteToken,
          inviteExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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

      // TODO: Отправить email с приглашением
      // Вход по одноразовому коду, поэтому просто ссылка на вход
      const inviteLink = `${process.env.NEXTAUTH_URL || "https://myunion.pro"}/login?email=${encodeURIComponent(email)}&invite=1`;
      
      console.log(`[Staff] Приглашение для ${email}: ${inviteLink}`);

      return NextResponse.json(
        {
          staff,
          message: `Приглашение отправлено на ${email}`,
          isExistingUser: false,
          inviteLink, // Для отладки (убрать в продакшене)
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
