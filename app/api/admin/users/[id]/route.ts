import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MembershipStatus, UserRole } from "@prisma/client";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { invalidateUsersCache } from "@/lib/cache-invalidation";

type UpdatePayload = {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  jobTitle?: string | null;
  profession?: string | null;
  education?: string | null;
  role?: UserRole;
  membershipStatus?: MembershipStatus;
};

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

// GET - получение данных одного пользователя
export async function GET(
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        documents: {
          orderBy: { createdAt: "desc" },
        },
        membershipHistory: {
          orderBy: { createdAt: "desc" },
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (err) {
    console.error(`[admin/users/GET] Error:`, err);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> },
) {
  const { error } = await ensureSuperAdmin();
  if (error) {
    return error;
  }

  const resolvedParams = await Promise.resolve(params);
  const userId = resolvedParams.id;

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: "Пользователь не найден" },
      { status: 404 },
    );
  }

  let payload: UpdatePayload;
  try {
    payload = (await request.json()) as UpdatePayload;
  } catch (error) {
    console.error("[admin/users] Неверный JSON", error);
    return NextResponse.json(
      { error: "Неверный формат данных" },
      { status: 400 },
    );
  }

  const updateData: UpdatePayload = {
    firstName: normalizeString(payload.firstName),
    lastName: normalizeString(payload.lastName),
    middleName: normalizeString(payload.middleName),
    phone: normalizeString(payload.phone),
    address: normalizeString(payload.address),
    jobTitle: normalizeString(payload.jobTitle),
    profession: normalizeString(payload.profession),
    education: normalizeString(payload.education),
  };

  // Обработка даты рождения
  if (payload.dateOfBirth !== undefined) {
    if (payload.dateOfBirth === null || payload.dateOfBirth === "") {
      updateData.dateOfBirth = null;
    } else {
      const date = new Date(payload.dateOfBirth);
      if (!isNaN(date.getTime())) {
        updateData.dateOfBirth = date.toISOString();
      }
    }
  }

  if (payload.role) {
    if (!Object.values(UserRole).includes(payload.role)) {
      return NextResponse.json(
        { error: "Некорректная роль" },
        { status: 400 },
      );
    }
    updateData.role = payload.role;
  }

  if (payload.membershipStatus) {
    if (!Object.values(MembershipStatus).includes(payload.membershipStatus)) {
      return NextResponse.json(
        { error: "Некорректный статус" },
        { status: 400 },
      );
    }
    updateData.membershipStatus = payload.membershipStatus;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Инвалидируем кеш пользователей
    await invalidateUsersCache();

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        middleName: updatedUser.middleName,
        phone: updatedUser.phone,
        dateOfBirth: updatedUser.dateOfBirth,
        address: updatedUser.address,
        jobTitle: updatedUser.jobTitle,
        profession: updatedUser.profession,
        education: updatedUser.education,
        role: updatedUser.role,
        membershipStatus: updatedUser.membershipStatus,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    console.error("[admin/users] Ошибка сохранения", error);
    return NextResponse.json(
      { error: "Не удалось обновить пользователя" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> },
) {
  const { session, error } = await ensureSuperAdmin();
  if (error) {
    return error;
  }

  const resolvedParams = await Promise.resolve(params);
  const userId = resolvedParams.id;
  const currentUserId = session!.user!.id;

  if (userId === currentUserId) {
    return NextResponse.json(
      { error: "Нельзя удалить собственный аккаунт" },
      { status: 400 },
    );
  }

  const userToDelete = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!userToDelete) {
    return NextResponse.json(
      { error: "Пользователь не найден" },
      { status: 404 },
    );
  }

  if (userToDelete.role === "SUPER_ADMIN") {
    const superAdminCount = await prisma.user.count({
      where: { role: "SUPER_ADMIN" },
    });

    if (superAdminCount <= 1) {
      return NextResponse.json(
        { error: "Нельзя удалить последнего суперадминистратора" },
        { status: 400 },
      );
    }
  }

  try {
    const { deleteUser } = await import("@/lib/delete-user");
    const result = await deleteUser(prisma, userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Ошибка удаления" }, { status: 400 });
    }
    await invalidateUsersCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/users] Ошибка удаления", error);
    return NextResponse.json(
      { error: "Не удалось удалить пользователя. Возможно есть связанные данные." },
      { status: 500 },
    );
  }
}


