/**
 * API для принятия приглашения сотрудника
 * GET /api/auth/staff-invite/[token] - получить информацию о приглашении
 * POST /api/auth/staff-invite/[token] - принять приглашение
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET - получить информацию о приглашении
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const staff = await prisma.organizationStaff.findFirst({
      where: {
        inviteToken: token,
        status: "PENDING",
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!staff) {
      return NextResponse.json(
        { error: "Приглашение не найдено или уже использовано" },
        { status: 404 }
      );
    }

    // Проверяем срок действия
    if (staff.inviteExpires && staff.inviteExpires < new Date()) {
      return NextResponse.json(
        { error: "Срок действия приглашения истек" },
        { status: 410 }
      );
    }

    return NextResponse.json({
      invite: {
        organization: staff.organization,
        role: staff.role,
        user: staff.user,
        invitedAt: staff.invitedAt,
        expiresAt: staff.inviteExpires,
        // Показываем, нужно ли вводить пароль (если есть tempPassword)
        needsPassword: !!staff.tempPassword,
      },
    });
  } catch (error) {
    console.error("[API] Error fetching invite:", error);
    return NextResponse.json(
      { error: "Ошибка при получении приглашения" },
      { status: 500 }
    );
  }
}

// POST - принять приглашение
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { password, firstName, lastName, middleName } = body;

    const staff = await prisma.organizationStaff.findFirst({
      where: {
        inviteToken: token,
        status: "PENDING",
      },
      include: {
        user: true,
        organization: {
          select: { name: true },
        },
        role: {
          select: { name: true },
        },
      },
    });

    if (!staff) {
      return NextResponse.json(
        { error: "Приглашение не найдено или уже использовано" },
        { status: 404 }
      );
    }

    // Проверяем срок действия
    if (staff.inviteExpires && staff.inviteExpires < new Date()) {
      return NextResponse.json(
        { error: "Срок действия приглашения истек" },
        { status: 410 }
      );
    }

    // Если нужен пароль и есть tempPassword, проверяем или устанавливаем новый
    let hashedPassword: string | undefined;
    if (staff.tempPassword && password) {
      // Устанавливаем новый пароль пользователя
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Обновляем данные пользователя если переданы
    if (firstName || lastName || middleName || hashedPassword) {
      await prisma.user.update({
        where: { id: staff.userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(middleName && { middleName }),
          ...(hashedPassword && { password: hashedPassword }),
        },
      });
    }

    // Активируем сотрудника
    await prisma.organizationStaff.update({
      where: { id: staff.id },
      data: {
        status: "ACTIVE",
        acceptedAt: new Date(),
        inviteToken: null, // Очищаем токен
        inviteExpires: null,
        tempPassword: null, // Очищаем временный пароль
      },
    });

    // Обновляем статус приглашения в истории
    await prisma.staffInvitation.updateMany({
      where: { token },
      data: {
        status: "accepted",
        acceptedByUserId: staff.userId,
        acceptedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Вы успешно присоединились к организации "${staff.organization.name}" как ${staff.role.name}`,
      redirectUrl: "/dashboard",
    });
  } catch (error) {
    console.error("[API] Error accepting invite:", error);
    return NextResponse.json(
      { error: "Ошибка при принятии приглашения" },
      { status: 500 }
    );
  }
}
