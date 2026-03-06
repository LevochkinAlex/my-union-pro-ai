/**
 * POST /api/admin/users/bulk-validate
 * Массовое одобрение или исключение пользователей (SUPER_ADMIN или org-head в scope)
 * Body: { userIds: string[], action: "approve" | "exclude" }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MembershipStatus } from "@prisma/client";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { getOrgHeadScope, canOrgHeadAccessUser } from "@/lib/org-head-permissions";
import { sendMembershipStatusNotification } from "@/lib/membership-notifications";

export async function POST(request: NextRequest) {
  try {
    const superResult = await ensureSuperAdmin();
    let scope: Awaited<ReturnType<typeof getOrgHeadScope>> = null;
    if (superResult.error) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) return superResult.error;
      scope = await getOrgHeadScope(session.user.id);
      if (!scope) return superResult.error;
    }

    const body = await request.json();
    const { userIds, action } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "Укажите массив userIds" },
        { status: 400 }
      );
    }

    if (!action || !["approve", "exclude"].includes(action)) {
      return NextResponse.json(
        { error: "action должен быть approve или exclude" },
        { status: 400 }
      );
    }

    const newStatus: MembershipStatus = action === "approve" ? "APPROVED" : "EXCLUDED";

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        organizationId: true,
        ppoHeadOrganizationId: true,
        mpoHeadOrganizationId: true,
        rpoHeadOrganizationId: true,
      },
    });

    const allowedIds: string[] = [];
    for (const user of users) {
      if (scope && !canOrgHeadAccessUser(scope, user)) continue;
      allowedIds.push(user.id);
    }

    if (allowedIds.length === 0) {
      return NextResponse.json(
        { error: "Нет доступа ни к одному из указанных пользователей" },
        { status: 403 }
      );
    }

    await prisma.user.updateMany({
      where: { id: { in: allowedIds } },
      data: { membershipStatus: newStatus },
    });

    if (action === "approve") {
      await prisma.document.updateMany({
        where: {
          userId: { in: allowedIds },
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: {
            in: ["SIGNED", "PENDING_REVIEW", "PENDING_APPROVAL", "PENDING_SIGNATURE", "GENERATED"],
          },
        },
        data: { status: "COMPLETED" },
      });
    }

    const notificationStatus = action === "approve" ? "APPROVED" : "REJECTED";
    for (const uid of allowedIds) {
      try {
        await sendMembershipStatusNotification(uid, notificationStatus);
      } catch (e) {
        console.error("[bulk-validate] Notification error for", uid, e);
      }
    }

    return NextResponse.json({
      success: true,
      updated: allowedIds.length,
      message:
        action === "approve"
          ? `Одобрено пользователей: ${allowedIds.length}`
          : `Исключено пользователей: ${allowedIds.length}`,
    });
  } catch (err) {
    console.error("[admin/users/bulk-validate] Error:", err);
    return NextResponse.json(
      { error: "Ошибка при массовом обновлении" },
      { status: 500 }
    );
  }
}
