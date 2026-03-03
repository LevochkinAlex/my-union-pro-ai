import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * POST /api/admin/users/invite
 * Приглашение пользователя по email (только SUPER_ADMIN).
 * Создаёт пользователя с токеном приглашения и отправляет письмо со ссылкой на /auth/invite.
 */
export async function POST(request: NextRequest) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : null;
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : null;
    const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;

    if (!email) {
      return NextResponse.json(
        { error: "Укажите email приглашаемого" },
        { status: 400 }
      );
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const baseUrl = process.env.NEXTAUTH_URL || "https://myunion.pro";
    const inviteUrl = `${baseUrl}/auth/invite?token=${inviteToken}`;

    let user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, firstName: true, lastName: true },
    });

    if (user) {
      if (user.emailVerified) {
        return NextResponse.json(
          { error: "Пользователь с таким email уже зарегистрирован" },
          { status: 400 }
        );
      }
      const updateData: Record<string, unknown> = {
        resetToken: inviteToken,
        resetTokenExpires: inviteTokenExpires,
      };
      if (firstName != null) updateData.firstName = firstName;
      if (lastName != null) updateData.lastName = lastName;
      if (phone != null) updateData.phone = phone;
      await prisma.user.update({
        where: { id: user.id },
        data: updateData as any,
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          phone,
          role: "PENDING_MEMBER",
          membershipStatus: "PROFILE_INCOMPLETE",
          resetToken: inviteToken,
          resetTokenExpires: inviteTokenExpires,
        },
        select: { id: true, emailVerified: true, firstName: true, lastName: true },
      });
    }

    await sendEmail({
      to: email,
      subject: "Приглашение в МойСоюз",
      html: `
        <p>Здравствуйте${user.firstName ? `, ${user.firstName}` : ""}!</p>
        <p>Вас приглашают в платформу <strong>МойСоюз</strong>. Перейдите по ссылке, чтобы завершить регистрацию и войти в личный кабинет.</p>
        <p><a href="${inviteUrl}" style="color: #2563eb;">Завершить регистрацию</a></p>
        <p>Ссылка действительна 7 дней.</p>
        <p>—<br>МойСоюз</p>
      `,
      text: `Здравствуйте! Вас приглашают в МойСоюз. Завершите регистрацию: ${inviteUrl}. Ссылка действительна 7 дней. — МойСоюз`,
    });

    return NextResponse.json({
      success: true,
      message: "Приглашение отправлено на " + email,
      userId: user.id,
    });
  } catch (e) {
    console.error("[admin/users/invite] POST error:", e);
    return NextResponse.json(
      { error: "Ошибка при отправке приглашения" },
      { status: 500 }
    );
  }
}
