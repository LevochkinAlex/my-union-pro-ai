import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { getOrgHeadScope, canOrgHeadAccessUser } from "@/lib/org-head-permissions";
import { MembershipStatus } from "@prisma/client";
import { sendMembershipStatusNotification } from "@/lib/membership-notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const superResult = await ensureSuperAdmin();
    let scope: Awaited<ReturnType<typeof getOrgHeadScope>> = null;
    if (superResult.error) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) return superResult.error;
      scope = await getOrgHeadScope(session.user.id);
      if (!scope) return superResult.error;
    }

    const resolvedParams = await Promise.resolve(params);
    const userId = resolvedParams.id;

    if (!userId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    const { status, comment } = await request.json();

    if (!status || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json(
        { error: "Некорректный статус. Допустимые значения: APPROVED, REJECTED" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        documents: {
          where: {
            type: {
              in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (scope && !canOrgHeadAccessUser(scope, user)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    // Обновляем статус пользователя
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        membershipStatus: status as MembershipStatus,
      },
    });

    // Обновляем статус документов
    if (status === "APPROVED") {
      await prisma.document.updateMany({
        where: {
          userId: userId,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: {
            in: ["SIGNED", "PENDING_REVIEW", "PENDING_APPROVAL", "PENDING_SIGNATURE", "GENERATED"],
          },
        },
        data: {
          status: "COMPLETED",
        },
      });
    } else if (status === "REJECTED") {
      await prisma.document.updateMany({
        where: {
          userId: userId,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: {
            in: ["SIGNED", "PENDING_REVIEW", "PENDING_APPROVAL", "PENDING_SIGNATURE", "GENERATED"],
          },
        },
        data: {
          status: "REJECTED",
        },
      });
    }

    // Отправляем уведомления (пуши и email)
    try {
      await sendMembershipStatusNotification(userId, status, comment);
    } catch (notificationError) {
      console.error("[admin/users/validate] Ошибка отправки уведомлений:", notificationError);
      // Не прерываем процесс, если уведомления не отправились
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: status === "APPROVED" 
        ? "Пользователь успешно одобрен" 
        : "Пользователь отклонен",
    });
  } catch (err) {
    console.error(`[admin/users/validate] Error:`, err);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

