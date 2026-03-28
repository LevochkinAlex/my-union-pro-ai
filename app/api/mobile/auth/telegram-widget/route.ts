import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramOAuthSearchParams, resolveTelegramLoginUser } from "@/lib/telegram-oauth-login";
import { issueMobileAccessToken } from "@/lib/mobile-auth";

/**
 * Завершение входа через Telegram Login Widget для мобильного приложения.
 * Тело: те же поля, что передаёт Telegram в query (id, hash, auth_date, …).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, string | undefined>;
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(body)) {
      if (val != null && val !== "") params.set(key, String(val));
    }

    const verified = verifyTelegramOAuthSearchParams(params);
    if (verified.ok === false) {
      const code = verified.error;
      return NextResponse.json(
        { error: "Ошибка проверки Telegram", code },
        { status: 401 },
      );
    }

    const { user } = await resolveTelegramLoginUser(verified.fields, undefined);

    const accessToken = issueMobileAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    return NextResponse.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error("[mobile/auth/telegram-widget]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
