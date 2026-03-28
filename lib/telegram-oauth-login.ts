import crypto from "crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { translitLatinToCyrillic } from "@/lib/translit-latin-to-cyrillic";

function pickName(existing: string | null | undefined, oauthValue: string | null | undefined): string | undefined {
  const existingTrimmed = existing?.trim();
  if (existingTrimmed) return undefined;
  if (!oauthValue) return undefined;
  return translitLatinToCyrillic(oauthValue);
}

function normalizePhone(p: string): string {
  let cleaned = p.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("8")) cleaned = "+7" + cleaned.slice(1);
  if (cleaned.startsWith("7") && !cleaned.startsWith("+")) cleaned = "+" + cleaned;
  return cleaned;
}

export type TelegramOAuthFields = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  photo_url: string | null;
  auth_date: string;
};

export function verifyTelegramOAuthSearchParams(searchParams: URLSearchParams):
  | { ok: false; error: string }
  | { ok: true; fields: TelegramOAuthFields } {
  const id = searchParams.get("id");
  const auth_date = searchParams.get("auth_date");
  const hash = searchParams.get("hash");

  if (!id || !auth_date || !hash) {
    return { ok: false, error: "missing_params" };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, error: "server_config" };
  }

  const dataCheckArray: string[] = [];
  searchParams.forEach((value, key) => {
    if (key !== "hash" && key !== "source") {
      dataCheckArray.push(`${key}=${value}`);
    }
  });
  dataCheckArray.sort();
  const dataCheckString = dataCheckArray.join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (hmac !== hash) {
    return { ok: false, error: "invalid_signature" };
  }

  const authTimestamp = parseInt(auth_date, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Number.isNaN(authTimestamp) || now - authTimestamp > 86400) {
    return { ok: false, error: "data_outdated" };
  }

  const phoneRaw = searchParams.get("phone");
  const normalizedPhone = phoneRaw ? normalizePhone(phoneRaw) : null;

  return {
    ok: true,
    fields: {
      id,
      first_name: searchParams.get("first_name"),
      last_name: searchParams.get("last_name"),
      username: searchParams.get("username"),
      phone: normalizedPhone,
      photo_url: searchParams.get("photo_url"),
      auth_date,
    },
  };
}

/** Поиск / создание пользователя по данным Telegram Login Widget (как в /api/auth/telegram/callback). */
export async function resolveTelegramLoginUser(
  f: TelegramOAuthFields,
  linkUserId: string | undefined,
): Promise<{ user: User; isNewUser: boolean }> {
  const { id, first_name, last_name, username, phone: normalizedPhone, photo_url } = f;

  let user: User | null = null;
  let isNewUser = false;

  if (linkUserId) {
    const existingTgUser = await prisma.user.findUnique({ where: { telegramChatId: id } });

    if (existingTgUser && existingTgUser.id !== linkUserId) {
      await prisma.document.updateMany({ where: { userId: existingTgUser.id }, data: { userId: linkUserId } });
      await prisma.membershipHistory.updateMany({ where: { userId: existingTgUser.id }, data: { userId: linkUserId } });
      await prisma.sMSPinCode.deleteMany({ where: { userId: existingTgUser.id } });
      await prisma.loginToken.deleteMany({ where: { userId: existingTgUser.id } });
      await prisma.emailPinCode.deleteMany({ where: { userId: existingTgUser.id } });
      await prisma.pushSubscription.deleteMany({ where: { userId: existingTgUser.id } });
      await prisma.phoneHistory.deleteMany({ where: { userId: existingTgUser.id } });
      await prisma.user.delete({ where: { id: existingTgUser.id } });
    }

    const currentUser = await prisma.user.findUnique({ where: { id: linkUserId } });
    const newFirstName = pickName(currentUser?.firstName, first_name);
    const newLastName = pickName(currentUser?.lastName, last_name);

    user = await prisma.user.update({
      where: { id: linkUserId },
      data: {
        telegramChatId: id,
        telegramUsername: username || currentUser?.telegramUsername || undefined,
        ...(newFirstName !== undefined ? { firstName: newFirstName } : {}),
        ...(newLastName !== undefined ? { lastName: newLastName } : {}),
        avatarUrl: currentUser?.avatarUrl || photo_url || undefined,
      },
    });

    return { user, isNewUser: false };
  }

  user = await prisma.user.findUnique({ where: { telegramChatId: id } });

  if (!user && username) {
    user = await prisma.user.findFirst({
      where: { telegramUsername: { equals: username, mode: "insensitive" } },
    });
    if (user) {
      const fn = pickName(user.firstName, first_name);
      const ln = pickName(user.lastName, last_name);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: id,
          telegramUsername: username || user.telegramUsername,
          ...(fn !== undefined ? { firstName: fn } : {}),
          ...(ln !== undefined ? { lastName: ln } : {}),
          avatarUrl: photo_url || user.avatarUrl,
        },
      });
    }
  }

  if (!user && normalizedPhone) {
    const phoneDigits = normalizedPhone.replace(/\D/g, "");
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: { contains: phoneDigits.slice(-10) } },
          { phone: `+7 (${phoneDigits.slice(1, 4)}) ${phoneDigits.slice(4, 7)}-${phoneDigits.slice(7, 9)}-${phoneDigits.slice(9)}` },
        ],
      },
    });

    if (user) {
      const existingTgUser = await prisma.user.findUnique({ where: { telegramChatId: id } });
      if (existingTgUser && existingTgUser.id !== user.id) {
        await prisma.document.updateMany({ where: { userId: existingTgUser.id }, data: { userId: user.id } });
        await prisma.membershipHistory.updateMany({ where: { userId: existingTgUser.id }, data: { userId: user.id } });
        await prisma.sMSPinCode.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.loginToken.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.emailPinCode.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.pushSubscription.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.phoneHistory.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.user.delete({ where: { id: existingTgUser.id } });
      }

      const fn = pickName(user.firstName, first_name);
      const ln = pickName(user.lastName, last_name);
      const updateData: Record<string, unknown> = {
        telegramChatId: id,
        telegramUsername: username || user.telegramUsername,
        ...(fn !== undefined ? { firstName: fn } : {}),
        ...(ln !== undefined ? { lastName: ln } : {}),
        phone: normalizedPhone,
      };
      if (!user.authPhone && normalizedPhone) {
        updateData.authPhone = normalizedPhone;
      }

      user = await prisma.user.update({ where: { id: user.id }, data: updateData });
    }
  }

  isNewUser = !user;

  if (user && !isNewUser) {
    const fn = pickName(user.firstName, first_name);
    const ln = pickName(user.lastName, last_name);
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        telegramUsername: username || user.telegramUsername,
        ...(fn !== undefined ? { firstName: fn } : {}),
        ...(ln !== undefined ? { lastName: ln } : {}),
        phone: normalizedPhone || user.phone,
      },
    });
  } else if (isNewUser) {
    const existingTgUser = await prisma.user.findUnique({ where: { telegramChatId: id } });

    if (existingTgUser) {
      const fn = pickName(existingTgUser.firstName, first_name);
      const ln = pickName(existingTgUser.lastName, last_name);
      user = await prisma.user.update({
        where: { id: existingTgUser.id },
        data: {
          telegramUsername: username || existingTgUser.telegramUsername,
          ...(fn !== undefined ? { firstName: fn } : {}),
          ...(ln !== undefined ? { lastName: ln } : {}),
          phone: normalizedPhone || existingTgUser.phone,
        },
      });
      isNewUser = false;
    } else {
      try {
        user = await prisma.user.create({
          data: {
            telegramChatId: id,
            telegramUsername: username || null,
            firstName: first_name ? translitLatinToCyrillic(first_name) : null,
            lastName: last_name ? translitLatinToCyrillic(last_name) : null,
            phone: normalizedPhone,
            authPhone: normalizedPhone,
            role: "PENDING_MEMBER",
            membershipStatus: "PROFILE_INCOMPLETE",
          },
        });
      } catch (createError: unknown) {
        const prismaErr = createError as { code?: string };
        if (prismaErr?.code === "P2002") {
          const foundUser = await prisma.user.findUnique({ where: { telegramChatId: id } });
          if (foundUser) {
            user = foundUser;
            isNewUser = false;
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
    }
  }

  if (!user) {
    throw new Error("Telegram login: user not resolved");
  }

  return { user, isNewUser };
}
