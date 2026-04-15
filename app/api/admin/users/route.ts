import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MembershipStatus, Prisma, UserRole } from "@prisma/client";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import {
  resolveEffectiveOrganization,
  resolveEffectiveWorkplace,
  resolveEffectiveWorkplaceInn,
} from "@/lib/user-effective-organization";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/users?search=...&page=1&limit=20
 * Список пользователей с поиском и пагинацией (SUPER_ADMIN или org-head в рамках scope).
 */
export async function GET(request: NextRequest) {
  try {
    const superResult = await ensureSuperAdmin();
    let scope: Awaited<ReturnType<typeof getOrgHeadScope>> = null;
    if (superResult.error) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) return superResult.error;
      scope = await getOrgHeadScope(session.user.id);
      if (!scope) return superResult.error;
      if (!scope.organizationIds?.length) {
        return NextResponse.json(
          { error: "Нет организаций в зоне ответственности" },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const tab = searchParams.get("tab")?.trim() || "all"; // all | validation | active
    const page = Math.max(1, parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10))
    );
    const skip = (page - 1) * limit;

    const searchWhere: Prisma.UserWhereInput | undefined = search
      ? (() => {
          const words = search.split(/\s+/).filter((w) => w.length > 0);
          if (words.length === 0) return undefined;
          const ilike = (field: string, value: string) => ({ [field]: { contains: value, mode: "insensitive" as const } });
          const orForWord = (word: string) => ({
            OR: [
              ilike("email", word),
              ilike("firstName", word),
              ilike("lastName", word),
              ilike("middleName", word),
            ],
          });
          return words.length === 1
            ? orForWord(words[0])
            : { AND: words.map((w) => orForWord(w)) };
        })()
      : undefined;

    const scopeWhere: Prisma.UserWhereInput | undefined = scope
      ? {
          OR: [
            { organizationId: { in: scope.organizationIds } },
            { ppoHeadOrganizationId: { in: scope.organizationIds } },
            { mpoHeadOrganizationId: { in: scope.organizationIds } },
            { rpoHeadOrganizationId: { in: scope.organizationIds } },
          ],
        }
      : undefined;

    const validationStatuses: MembershipStatus[] = [
      "PENDING_VERIFICATION",
      "DOCUMENTS_PENDING",
      "PROFILE_INCOMPLETE",
    ];

    const tabWhere: Prisma.UserWhereInput | undefined =
      tab === "validation"
        ? {
            membershipStatus: {
              in: validationStatuses,
            },
          }
        : tab === "active"
          ? { membershipStatus: "APPROVED" }
          : undefined;

    const whereClauses: Prisma.UserWhereInput[] = [
      // Партнёры ведутся в /admin/partners — не дублировать в общем списке пользователей
      { role: { not: UserRole.PARTNER } },
      { partnerRecordId: null },
    ];
    if (searchWhere) whereClauses.push(searchWhere);
    if (scopeWhere) whereClauses.push(scopeWhere);
    if (tabWhere) whereClauses.push(tabWhere);
    const where: Prisma.UserWhereInput | undefined = whereClauses.length
      ? { AND: whereClauses }
      : undefined;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          membershipStatus: true,
          createdAt: true,
          workplace: true,
          organization: {
            select: {
              id: true,
              name: true,
              inn: true,
            },
          },
          ppoHeadOrganization: {
            select: {
              id: true,
              name: true,
              inn: true,
            },
          },
          mpoHeadOrganization: {
            select: {
              id: true,
              name: true,
              inn: true,
            },
          },
          rpoHeadOrganization: {
            select: {
              id: true,
              name: true,
              inn: true,
            },
          },
          documents: {
            where: {
              type: {
                in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
              },
              status: {
                in: ["SIGNED", "PENDING_REVIEW", "PENDING_APPROVAL", "PENDING_SIGNATURE", "DRAFT"],
              },
            },
            select: {
              id: true,
              type: true,
              status: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const normalizedUsers = users.map((user: any) => {
      const effectiveOrganization = resolveEffectiveOrganization(user);
      return {
        ...user,
        effectiveOrganization,
        effectiveWorkplace: resolveEffectiveWorkplace(user),
        effectiveWorkplaceInn: resolveEffectiveWorkplaceInn(user),
        chairmanOfOrganization:
          user.ppoHeadOrganization ?? user.mpoHeadOrganization ?? user.rpoHeadOrganization ?? null,
      };
    });

    return NextResponse.json({
      users: normalizedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[admin/users] GET list error:", err.message, err.stack);
    return NextResponse.json(
      {
        error: "Ошибка загрузки списка пользователей",
        details: process.env.NODE_ENV === "development" ? err.message : undefined,
      },
      { status: 500 }
    );
  }
}
