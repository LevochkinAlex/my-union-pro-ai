import { NextResponse } from "next/server";

/** @deprecated Используйте подтверждение по ссылке из письма (GET /api/auth/register/confirm) */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Регистрация по коду из письма отключена. Подтвердите email по ссылке из письма после отправки формы на странице «Регистрация».",
    },
    { status: 410 },
  );
}
