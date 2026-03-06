import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const staff = await prisma.organizationStaff.findFirst({
      where: { id, organizationId: { in: scope.organizationIds } },
      include: {
        user: { select: { id: true, email: true } },
        role: { select: { name: true } },
      },
    });

    if (!staff) {
      return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    }
    if (staff.status !== "PENDING") {
      return NextResponse.json(
        { error: "Повторная отправка доступна только для приглашённых (ожидание)" },
        { status: 400 }
      );
    }

    const email = staff.user?.email;
    if (!email) {
      return NextResponse.json({ error: "У сотрудника не указан email" }, { status: 400 });
    }

    const inviteToken = generateInviteToken();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.organizationStaff.update({
      where: { id },
      data: { inviteToken, inviteExpires },
    });

    const org = await prisma.organization.findUnique({
      where: { id: staff.organizationId },
      select: { name: true },
    });
    const inviteLink = `${process.env.NEXTAUTH_URL || "https://myunion.pro"}/login?email=${encodeURIComponent(email)}&invite=1`;

    await sendEmail({
      to: email,
      subject: "Повторное приглашение в состав управляющего органа профкома",
      text: `Здравствуйте!\n\nВам повторно отправлено приглашение в состав управляющего органа (${org?.name || "профком"}) с ролью «${staff.role.name}».\n\nДля входа перейдите по ссылке (действует 7 дней):\n${inviteLink}\n\n--\nМойСоюз`,
      html: `<p>Здравствуйте!</p><p>Вам повторно отправлено приглашение в состав управляющего органа <strong>${org?.name || "профком"}</strong> с ролью «${staff.role.name}».</p><p><a href="${inviteLink}">Войти в личный кабинет</a></p><p>--<br>МойСоюз</p>`,
    });

    return NextResponse.json({ message: `Приглашение повторно отправлено на ${email}` });
  } catch (error) {
    console.error("[org-head/staff/[id]/resend-invite] error:", error);
    return NextResponse.json({ error: "Ошибка при отправке приглашения" }, { status: 500 });
  }
}
