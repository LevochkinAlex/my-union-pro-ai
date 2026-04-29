import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import {
  issueImpersonationRestoreToken,
  type ImpersonationRestoreAdminPayload,
} from "@/lib/impersonation-restore-token";
import { prisma } from "@/lib/prisma";

/**
 * Данные для выхода из impersonation + короткоживущий JWT для NextAuth restore-admin
 * POST /api/admin/impersonate/stop
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isImpersonating || !session.user.originalAdminId) {
      return NextResponse.json(
        { error: "Вы не находитесь в режиме impersonation" },
        { status: 400 }
      );
    }

    const adminId = session.user.originalAdminId;
    const impersonatedUserId = session.user.id;

    let adminPayload: ImpersonationRestoreAdminPayload | null = null;
    let adminAvatarUrl: string | null = null;

    try {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          membershipStatus: true,
          avatarUrl: true,
        },
      });
      if (adminUser?.role === "SUPER_ADMIN") {
        adminAvatarUrl = adminUser.avatarUrl;
        adminPayload = {
          id: adminUser.id,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          role: adminUser.role,
          membershipStatus: adminUser.membershipStatus,
        };
      }
    } catch (e) {
      console.error("[impersonate/stop] prisma:", e);
    }

    if (!adminPayload && session.user.restoreAdminProfile) {
      const snap = session.user.restoreAdminProfile;
      if (String(snap.id) === adminId && snap.role === "SUPER_ADMIN") {
        adminPayload = {
          id: snap.id,
          email: snap.email ?? null,
          firstName: snap.firstName ?? null,
          lastName: snap.lastName ?? null,
          role: snap.role,
          membershipStatus: snap.membershipStatus,
        };
      }
    }

    if (!adminPayload) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET!,
        });
        const snap = token?.restoreAdminProfile;
        const ok =
          token?.isImpersonating === true &&
          String(token.originalAdminId ?? "") === adminId &&
          snap &&
          String(snap.id) === adminId &&
          snap.role === "SUPER_ADMIN";
        if (ok) {
          adminPayload = {
            id: snap.id,
            email: snap.email ?? null,
            firstName: snap.firstName ?? null,
            lastName: snap.lastName ?? null,
            role: snap.role,
            membershipStatus: snap.membershipStatus,
          };
        }
      } catch (e) {
        console.error("[impersonate/stop] getToken(req):", e);
      }
    }

    if (!adminPayload) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Не удалось получить данные администратора (БД недоступна или сессия устарела). Попробуйте заново войти от имени пользователя.",
        },
        { status: 503 }
      );
    }

    const restoreJwt = issueImpersonationRestoreToken({
      admin: adminPayload,
      impersonatedUserId,
    });

    return NextResponse.json({
      success: true,
      adminId,
      restoreJwt,
      adminUser: {
        id: adminPayload.id,
        email: adminPayload.email,
        firstName: adminPayload.firstName,
        lastName: adminPayload.lastName,
        role: adminPayload.role,
        membershipStatus: adminPayload.membershipStatus,
        avatarUrl: adminAvatarUrl,
      },
    });
  } catch (error) {
    console.error("[impersonate/stop] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Ошибка при выходе из режима impersonation",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

