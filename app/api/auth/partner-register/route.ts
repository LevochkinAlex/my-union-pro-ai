import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole, MembershipStatus } from "@prisma/client";
import { verifyPartnerInvite } from "@/lib/partner-invite-token";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON в теле запроса", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Ожидается объект JSON", 400);
  }

  const record = body as Record<string, unknown>;
  const inviteToken = typeof record.inviteToken === "string" ? record.inviteToken.trim() : "";

  const { email: rawEmail, name: rawName, companyName: rawCompany } = record;

  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const name = typeof rawName === "string" ? rawName.trim() : "";
  const companyName =
    typeof rawCompany === "string" ? rawCompany.trim() : "";

  if (!email) {
    return jsonError("Укажите email", 400);
  }
  if (!EMAIL_REGEX.test(email)) {
    return jsonError("Укажите корректный email", 400);
  }
  if (!name) {
    return jsonError("Укажите имя контактного лица", 400);
  }
  if (name.length > 200) {
    return jsonError("Имя слишком длинное", 400);
  }

  const verifiedAt = new Date();

  if (inviteToken) {
    const payload = verifyPartnerInvite(inviteToken);
    if (!payload) {
      return jsonError("Ссылка приглашения недействительна или истекла", 400);
    }
    if (payload.email !== email) {
      return jsonError("Email не совпадает с приглашением", 400);
    }

    const partner = await prisma.partner.findUnique({
      where: { id: payload.partnerId },
      select: { id: true, email: true },
    });
    if (!partner) {
      return jsonError("Карточка партнёра не найдена", 404);
    }
    const partnerEmail = (partner.email ?? "").trim().toLowerCase();
    if (partnerEmail && partnerEmail !== payload.email) {
      return jsonError("Данные карточки изменились. Запросите новое приглашение у администратора.", 400);
    }

    const cabinetExists = await prisma.user.findFirst({
      where: { partnerRecordId: partner.id },
      select: { id: true },
    });
    if (cabinetExists) {
      return jsonError("Кабинет для этой карточки уже зарегистрирован", 409);
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return jsonError("Пользователь с таким email уже зарегистрирован", 409);
    }

    try {
      const user = await prisma.user.create({
        data: {
          email,
          firstName: name,
          role: UserRole.PARTNER,
          membershipStatus: MembershipStatus.APPROVED,
          emailVerified: verifiedAt,
          partnerRecordId: partner.id,
        },
        select: { id: true },
      });
      return NextResponse.json({ ok: true, userId: user.id });
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        return jsonError("Пользователь с таким email уже зарегистрирован", 409);
      }
      console.error("[partner-register invite]", e);
      return jsonError("Внутренняя ошибка сервера. Попробуйте позже.", 500);
    }
  }

  if (!companyName) {
    return jsonError("Укажите название компании", 400);
  }
  if (companyName.length > 500) {
    return jsonError("Название компании слишком длинное", 400);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return jsonError("Пользователь с таким email уже зарегистрирован", 409);
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const partner = await tx.partner.create({
        data: {
          name: companyName,
          contactFirstName: name,
          email,
        },
      });

      return tx.user.create({
        data: {
          email,
          firstName: name,
          role: UserRole.PARTNER,
          membershipStatus: MembershipStatus.APPROVED,
          emailVerified: verifiedAt,
          partnerRecordId: partner.id,
        },
        select: { id: true },
      });
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return jsonError("Пользователь с таким email уже зарегистрирован", 409);
    }
    console.error("[partner-register]", e);
    return jsonError("Внутренняя ошибка сервера. Попробуйте позже.", 500);
  }
}
