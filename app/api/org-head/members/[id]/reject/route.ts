import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { sendUserNotification } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: memberId } = await context.params;

    let reason = "";
    try {
      const body = await request.json();
      reason = (body.reason || "").trim();
    } catch {
      // empty body
    }

    if (!reason) {
      return NextResponse.json(
        { error: "Необходимо указать причину отклонения" },
        { status: 400 }
      );
    }

    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: { id: true, organizationId: true, membershipStatus: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (!member.organizationId || !scope.organizationIds.includes(member.organizationId)) {
      return NextResponse.json({ error: "Нет доступа к пользователю" }, { status: 403 });
    }

    if (member.membershipStatus === "APPROVED") {
      return NextResponse.json(
        { error: "Нельзя отклонить одобренного пользователя. Используйте исключение." },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: memberId },
      data: { membershipStatus: "REJECTED" },
    });

    try {
      await sendUserNotification({
        userId: member.id,
        type: "ticket_response",
        title: "Заявка отклонена",
        body: `Ваша заявка на вступление в профсоюз отклонена. Причина: ${reason}`,
        url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard/profile`,
      });
    } catch (notifErr: unknown) {
      const notifMsg = notifErr instanceof Error ? notifErr.message : "unknown";
      console.warn("[org-head/members/reject] notification failed:", notifMsg);
    }

    return NextResponse.json({
      success: true,
      message: "Заявка отклонена",
      member: updated,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[org-head/members/reject]", msg);
    return NextResponse.json({ error: "Ошибка при отклонении заявки" }, { status: 500 });
  }
}
