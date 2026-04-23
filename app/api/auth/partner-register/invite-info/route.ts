import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPartnerInvite } from "@/lib/partner-invite-token";

/**
 * GET /api/auth/partner-register/invite-info?invite=TOKEN
 * Возвращает данные для предзаполнения формы (без секретов).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("invite")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Не указан токен" }, { status: 400 });
  }

  const payload = verifyPartnerInvite(token);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Ссылка недействительна или истекла" }, { status: 400 });
  }

  const partner = await prisma.partner.findUnique({
    where: { id: payload.partnerId },
    select: {
      name: true,
      email: true,
      contactFirstName: true,
      contactLastName: true,
      contactMiddleName: true,
    },
  });

  if (!partner) {
    return NextResponse.json({ ok: false, error: "Карточка партнёра не найдена" }, { status: 404 });
  }

  const norm = (partner.email ?? "").trim().toLowerCase();
  if (norm && norm !== payload.email) {
    return NextResponse.json({ ok: false, error: "Ссылка устарела: email карточки изменён" }, { status: 400 });
  }

  const cabinet = await prisma.user.findFirst({
    where: { partnerRecordId: payload.partnerId },
    select: { id: true },
  });
  if (cabinet) {
    return NextResponse.json(
      {
        ok: false,
        error: "Кабинет уже зарегистрирован. Войдите через email на странице входа.",
        loginSuggested: true,
      },
      { status: 409 }
    );
  }

  const contactHint = [partner.contactLastName, partner.contactFirstName, partner.contactMiddleName]
    .filter(Boolean)
    .join(" ")
    .trim();

  try {
    await prisma.partner.updateMany({
      where: { id: payload.partnerId, cabinetInviteFirstOpenAt: null },
      data: { cabinetInviteFirstOpenAt: new Date() },
    });
  } catch (e) {
    console.error("[partner-register/invite-info] cabinetInviteFirstOpenAt", e);
  }

  return NextResponse.json({
    ok: true,
    email: payload.email,
    companyName: partner.name,
    contactNameHint: contactHint || null,
  });
}
