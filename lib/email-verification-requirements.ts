import { prisma } from "@/lib/prisma";
import { capitalizeName } from "@/lib/utils/nameFormatting";

export const EMAIL_NEEDS_NAME_MESSAGE =
  "Сначала укажите фамилию и имя в профиле. После сохранения профиля можно запросить код подтверждения email.";

/**
 * Для подтверждения email нужны имя и фамилия в БД.
 * Если в БД пусто, но переданы в теле запроса — записываем (анкета/форма до полного сохранения).
 */
export async function ensureNamesBeforeEmailVerification(
  userId: string,
  bodyNames: { firstName?: string | null; lastName?: string | null },
): Promise<{ ok: true } | { ok: false; error: string; code: "PROFILE_NEEDS_NAME" }> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  if (!me) {
    return { ok: false, error: "Пользователь не найден", code: "PROFILE_NEEDS_NAME" };
  }

  const dbOk = Boolean(me.firstName?.trim() && me.lastName?.trim());
  if (dbOk) {
    return { ok: true };
  }

  const fn = bodyNames.firstName?.trim();
  const ln = bodyNames.lastName?.trim();
  if (fn && ln) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: capitalizeName(fn),
        lastName: capitalizeName(ln),
      },
    });
    return { ok: true };
  }

  return {
    ok: false,
    error: EMAIL_NEEDS_NAME_MESSAGE,
    code: "PROFILE_NEEDS_NAME",
  };
}
