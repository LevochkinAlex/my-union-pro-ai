import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { signPartnerInvite } from "@/lib/partner-invite-token";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function baseUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3004"
  );
}

/**
 * POST /api/admin/partners/[id]/send-registration-email
 * Отправляет на указанный email ссылку для завершения регистрации кабинета партнёра (существующая карточка Partner).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const superResult = await ensureSuperAdmin();
  if (superResult.error) return superResult.error;

  const { id: partnerId } = await context.params;
  if (!partnerId) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
    return NextResponse.json({ error: "Укажите корректный email" }, { status: 400 });
  }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true, email: true, cabinetInviteSentAt: true },
  });

  if (!partner) {
    return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
  }

  const existingCabinet = await prisma.user.findFirst({
    where: { partnerRecordId: partnerId },
    select: { id: true },
  });
  if (existingCabinet) {
    return NextResponse.json(
      { error: "У этой карточки партнёра уже есть учётная запись кабинета. При необходимости используйте «Войти как»." },
      { status: 409 }
    );
  }

  const emailTaken = await prisma.user.findUnique({
    where: { email: rawEmail },
    select: { id: true, role: true, partnerRecordId: true },
  });
  if (emailTaken) {
    return NextResponse.json(
      { error: "Пользователь с таким email уже зарегистрирован. Используйте другой email или привязку по ID пользователя." },
      { status: 409 }
    );
  }

  await prisma.partner.update({
    where: { id: partnerId },
    data: {
      email: rawEmail,
      ...(partner.cabinetInviteSentAt ? {} : { cabinetInviteSentAt: new Date() }),
    },
  });

  let token: string;
  try {
    token = signPartnerInvite(partnerId, rawEmail);
  } catch (e) {
    console.error("[send-registration-email] token", e);
    return NextResponse.json(
      { error: "Не настроен NEXTAUTH_SECRET — нельзя сформировать ссылку приглашения" },
      { status: 500 }
    );
  }

  const inviteUrl = `${baseUrl()}/register/partner?invite=${encodeURIComponent(token)}`;

  try {
    const { sent, previewUrl } = await sendEmail({
      to: rawEmail,
      subject: "Регистрация кабинета партнёра — МойСоюз",
      html: `
      <p>Здравствуйте!</p>
      <p>Для вас создана карточка партнёра <strong>${escapeHtml(partner.name)}</strong> в системе МойСоюз.</p>
      <p>Чтобы получить доступ к личному кабинету партнёра (площадки, промокоды, условия), перейдите по ссылке и завершите регистрацию:</p>
      <p><a href="${inviteUrl}" style="color: #2563eb;">Зарегистрировать кабинет партнёра</a></p>
      <p>Ссылка действительна 14 дней.</p>
      <p>Если вы не ожидали это письмо, просто проигнорируйте его.</p>
      <p>—<br>МойСоюз</p>
    `,
      text: `Здравствуйте!\n\nДля вас создана карточка партнёра «${partner.name}» в системе МойСоюз.\n\nЗавершите регистрацию кабинета партнёра по ссылке (действует 14 дней):\n${inviteUrl}\n\n— МойСоюз`,
    });

    return NextResponse.json({
      ok: true,
      sent: Boolean(sent),
      previewUrl: previewUrl ?? undefined,
      inviteUrl: sent ? undefined : inviteUrl,
      message: sent
        ? "Письмо отправлено"
        : "Почта не отправлена (SMTP/Resend); ссылка в ответе для ручной передачи",
    });
  } catch (e) {
    console.error("[send-registration-email] sendEmail", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Ошибка отправки почты: ${e.message}`
            : "Не удалось отправить письмо. Проверьте настройки SMTP.",
        sent: false,
        inviteUrl,
      },
      { status: 502 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
