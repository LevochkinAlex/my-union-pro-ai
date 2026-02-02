/**
 * POST /api/admin/users/merge
 * Объединить аккаунт source в target (все связи source перевести на target, источник помечается как объединённый).
 * Только SUPER_ADMIN.
 * Body: { targetUserId: string, sourceUserId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeUsers } from "@/lib/account-merge";
import { UserRole } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Доступ только для суперадмина" }, { status: 403 });
    }

    const body = await request.json();
    const targetUserId = body?.targetUserId;
    const sourceUserId = body?.sourceUserId;
    if (!targetUserId || !sourceUserId) {
      return NextResponse.json(
        { error: "Укажите targetUserId и sourceUserId" },
        { status: 400 }
      );
    }

    const result = await mergeUsers(prisma, targetUserId, sourceUserId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: "Аккаунты объединены" });
  } catch (error) {
    console.error("[admin/users/merge]", error);
    return NextResponse.json(
      { error: "Ошибка при объединении аккаунтов" },
      { status: 500 }
    );
  }
}
