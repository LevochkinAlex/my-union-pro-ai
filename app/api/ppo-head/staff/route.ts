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
import { sendEmail } from "@/lib/email";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

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

    const access = await checkUserPermissions(session.user.id, "staff_view");
    const organizationId = access.hasAccess ? access.organizationId : null;

    if (!organizationId) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "staff_view",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
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

    return NextResponse.json({
      staff: staff.map((item) => ({
        ...item,
        role: {
          ...item.role,
          permissions: normalizeStaffPermissions(item.role.permissions),
        },
      })),
    });
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

    const access = await checkUserPermissions(session.user.id, "staff_manage");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json(
        {
          error: "Недостаточно прав для добавления сотрудников",
          requiredPermission: "staff_manage",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
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
        organizationId: access.organizationId,
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
      where: { id: access.organizationId },
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
            organizationId: access.organizationId,
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
          organizationId: access.organizationId,
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
          type: "staff_added",
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
              organizationId: access.organizationId,
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
            organizationId: access.organizationId,
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
            type: "staff_added",
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
          organizationId: access.organizationId,
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
          organizationId: access.organizationId,
          email,
          roleId,
          token: inviteToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: "pending",
          invitedByUserId: session.user.id,
        },
      });

      const inviteLink = `${process.env.NEXTAUTH_URL || "https://myunion.pro"}/login?email=${encodeURIComponent(email)}&invite=1`;
      const orgName = organization?.name || "профком";
      const roleName = role.name;

      try {
        await sendEmail({
          to: email,
          subject: "Приглашение в состав управляющего органа профкома",
          text: `Здравствуйте!\n\nВас приглашают в состав управляющего органа (${orgName}) с ролью «${roleName}».\n\nДля входа в личный кабинет перейдите по ссылке (действует 7 дней):\n${inviteLink}\n\nВход выполняется по одноразовому коду на email.\n\n--\nС уважением,\nМойСоюз`,
          html: `
            <p>Здравствуйте!</p>
            <p>Вас приглашают в состав управляющего органа <strong>${orgName}</strong> с ролью «${roleName}».</p>
            <p>Для входа в личный кабинет перейдите по ссылке (действует 7 дней):</p>
            <p><a href="${inviteLink}" style="color: #2563eb;">Войти в личный кабинет</a></p>
            <p>Вход выполняется по одноразовому коду на email.</p>
            <p>--<br>С уважением,<br>МойСоюз</p>
          `,
        });
        console.log(`[Staff] Приглашение отправлено на ${email}`);
      } catch (emailError) {
        console.error("[Staff] Ошибка отправки email приглашения:", emailError);
        // Не падаем — приглашение создано, ссылку можно отправить повторно
      }

      return NextResponse.json(
        {
          staff,
          message: `Приглашение отправлено на ${email}`,
          isExistingUser: false,
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
