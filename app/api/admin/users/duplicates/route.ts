/**
 * GET /api/admin/users/duplicates
 * Список групп возможных дубликатов (по телефону, email, истории телефонов).
 * Только SUPER_ADMIN.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findDuplicateGroups } from "@/lib/account-merge";
import { UserRole } from "@prisma/client";

export async function GET() {
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

    const groups = await findDuplicateGroups(prisma);
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("[admin/users/duplicates]", error);
    return NextResponse.json(
      { error: "Ошибка при получении списка дубликатов" },
      { status: 500 }
    );
  }
}
