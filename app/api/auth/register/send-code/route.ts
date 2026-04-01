import { NextResponse } from "next/server";

/** @deprecated Используйте POST /api/auth/register/submit */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Регистрация по коду из письма отключена. Заполните форму на странице «Регистрация» и подтвердите email по ссылке.",
    },
    { status: 410 },
  );
}
