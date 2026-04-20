/**
 * Пользователь техподдержки для чатов.
 * Один общий аккаунт support@myunion.pro — участник всех чатов с поддержкой.
 */

import { prisma } from "@/lib/prisma";

const SUPPORT_EMAIL = process.env.SUPPORT_USER_EMAIL || "support@myunion.pro";

let cachedSupportUserId: string | null = null;

/**
 * Возвращает ID пользователя техподдержки (по email).
 * При отсутствии создаёт пользователя с ролью PENDING_MEMBER (доступ только для чата).
 */
export async function getSupportUserId(): Promise<string | null> {
  if (cachedSupportUserId) return cachedSupportUserId;

  let user = await prisma.user.findUnique({
    where: { email: SUPPORT_EMAIL },
    select: { id: true },
  });

  if (!user) {
    try {
      user = await prisma.user.create({
        data: {
          email: SUPPORT_EMAIL,
          firstName: "Техподдержка",
          lastName: "МойСоюз",
          role: "PENDING_MEMBER",
          emailVerified: new Date(),
        },
        select: { id: true },
      });
    } catch (e: any) {
      if (e?.code !== "P2002") throw e;
      user = await prisma.user.findUnique({
        where: { email: SUPPORT_EMAIL },
        select: { id: true },
      });
    }
  }

  if (user) cachedSupportUserId = user.id;
  return user?.id ?? null;
}

export function getSupportEmail(): string {
  return SUPPORT_EMAIL;
}
