import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { resolveEffectiveOrganization } from "@/lib/user-effective-organization";

// GET /api/org-head/users/search?q=... OR ?email=...&phone=...
// Поиск по q (имя/email/телефон в scope) или по email/телефон для назначения председателем (тот же формат что admin)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim().toLowerCase();
    const phone = searchParams.get("phone")?.trim();

    // Режим поиска по email/телефону (как в admin для назначения председателя)
    if (email || phone) {
      const normalizedPhone = phone ? phone.replace(/\D/g, "") : null;
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            ...(email ? [{ email }] : []),
            ...(normalizedPhone
              ? [
                  { phone: { contains: normalizedPhone } },
                  { authPhone: { contains: normalizedPhone } },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatarUrl: true,
          jobTitle: true,
          role: true,
          membershipStatus: true,
          isPPOHead: true,
          isMPOHead: true,
          isRPOHead: true,
          ppoHeadOrganizationId: true,
          mpoHeadOrganizationId: true,
          rpoHeadOrganizationId: true,
          ppoHeadOrganization: { select: { id: true, name: true } },
          mpoHeadOrganization: { select: { id: true, name: true } },
          rpoHeadOrganization: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
        },
      });
      if (!user) {
        return NextResponse.json({ found: false, user: null });
      }
      const fullName = [user.lastName, user.firstName, user.middleName]
        .filter(Boolean)
        .join(" ");
      const currentHeadOrganization = resolveEffectiveOrganization(user);
      const isHead = user.isPPOHead || user.isMPOHead || user.isRPOHead;
      return NextResponse.json({
        found: true,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          middleName: user.middleName,
          fullName: fullName || null,
          avatarUrl: user.avatarUrl,
          jobTitle: user.jobTitle,
          role: user.role,
          membershipStatus: user.membershipStatus,
          isPPOHead: user.isPPOHead,
          isMPOHead: user.isMPOHead,
          isRPOHead: user.isRPOHead,
          isHead,
          currentPPOOrganization: user.ppoHeadOrganization,
          currentMPOOrganization: user.mpoHeadOrganization,
          currentRPOOrganization: user.rpoHeadOrganization,
          currentHeadOrganization,
          memberOrganization: user.organization,
        },
      });
    }

    const q = searchParams.get("q")?.trim() || "";
    const limitRaw = Number(searchParams.get("limit") || "20");
    const limit = Math.min(Math.max(limitRaw, 1), 50);

    if (q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        organizationId: { in: scope.organizationIds },
        id: { not: session.user.id },
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { middleName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        phone: true,
        membershipStatus: true,
        organization: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: limit,
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("[org-head/users/search] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка поиска пользователей",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

