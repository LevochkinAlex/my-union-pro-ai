/**
 * POST /api/ppo-head/staff/[id]/resend-invite
 * Повторная отправка приглашения сотруднику со статусом PENDING (email с ссылкой на вход).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    if (!user?.isPPOHead || !user.ppoHeadOrganizationId) {
      return NextResponse.json(
        { error: "Только Председатель может отправлять приглашения" },
        { status: 403 }
      );
    }

    const staff = await prisma.organizationStaff.findFirst({
      where: {
        id,
        organizationId: user.ppoHeadOrganizationId,
      },
      include: {
        user: {
          select: { id: true, email: true },
        },
        role: { select: { name: true } },
      },
    });

    if (!staff) {
      return NextResponse.json(
        { error: "Сотрудник не найден" },
        { status: 404 }
      );
    }

    if (staff.status !== "PENDING") {
      return NextResponse.json(
        { error: "Повторная отправка доступна только для приглашённых (ожидание)" },
        { status: 400 }
      );
    }

    const email = staff.user?.email;
    if (!email) {
      return NextResponse.json(
        { error: "У сотрудника не указан email" },
        { status: 400 }
      );
    }

    const inviteToken = generateInviteToken();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.organizationStaff.update({
      where: { id },
      data: { inviteToken, inviteExpires },
    });

    const organization = await prisma.organization.findUnique({
      where: { id: user.ppoHeadOrganizationId },
      select: { name: true },
    });
    const inviteLink = `${process.env.NEXTAUTH_URL || "https://myunion.pro"}/login?email=${encodeURIComponent(email)}&invite=1`;
    const orgName = organization?.name || "профком";
    const roleName = staff.role.name;

    try {
      await sendEmail({
        to: email,
        subject: "Повторное приглашение в состав управляющего органа профкома",
        text: `Здравствуйте!\n\nВам повторно отправлено приглашение в состав управляющего органа (${orgName}) с ролью «${roleName}».\n\nДля входа в личный кабинет перейдите по ссылке (действует 7 дней):\n${inviteLink}\n\nВход выполняется по одноразовому коду на email.\n\n--\nС уважением,\nМойСоюз`,
        html: `
          <p>Здравствуйте!</p>
          <p>Вам повторно отправлено приглашение в состав управляющего органа <strong>${orgName}</strong> с ролью «${roleName}».</p>
          <p>Для входа в личный кабинет перейдите по ссылке (действует 7 дней):</p>
          <p><a href="${inviteLink}" style="color: #2563eb;">Войти в личный кабинет</a></p>
          <p>Вход выполняется по одноразовому коду на email.</p>
          <p>--<br>С уважением,<br>МойСоюз</p>
        `,
      });
      console.log(`[Staff] Повторное приглашение отправлено на ${email}`);
    } catch (emailError) {
      console.error("[Staff] Ошибка отправки повторного приглашения:", emailError);
      return NextResponse.json(
        { error: "Не удалось отправить email. Проверьте настройки SMTP." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: `Приглашение повторно отправлено на ${email}`,
    });
  } catch (error) {
    console.error("[API] Error resending staff invite:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке приглашения" },
      { status: 500 }
    );
  }
}
