import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { MembershipStatus } from "@prisma/client";
import { sendMembershipStatusNotification } from "@/lib/membership-notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) return error;

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
          status: "APPROVED",
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

