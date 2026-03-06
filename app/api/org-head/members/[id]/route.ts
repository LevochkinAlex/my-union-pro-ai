import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { normalizePhone } from "@/lib/utils/phone";
import {
  resolveEffectiveOrganization,
  resolveEffectiveWorkplace,
  resolveEffectiveWorkplaceInn,
} from "@/lib/user-effective-organization";

const MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  email: true,
  phone: true,
  authPhone: true,
  jobTitle: true,
  profession: true,
  education: true,
  workplace: true,
  workplaceInn: true,
  directorName: true,
  directorPosition: true,
  employmentStatus: true,
  avatarUrl: true,
  dateOfBirth: true,
  address: true,
  preferredDiscountCity: true,
  aboutMe: true,
  hobbies: true,
  maritalStatus: true,
  spouseInfo: true,
  hasChildren: true,
  childrenInfo: true,
  childrenBirthDates: true,
  training: true,
  additionalInfo: true,
  professions: true,
  educations: true,
  awards: true,
  membershipStatus: true,
  unionMembershipStatus: true,
  unionCardNumber: true,
  membershipJoinedAt: true,
  membershipExcludedAt: true,
  membershipExclusionReason: true,
  bestBenefitsUserId: true,
  bestBenefitsStatus: true,
  emailVerified: true,
  role: true,
  isPPOHead: true,
  ppoHeadOrganizationId: true,
  createdAt: true,
  updatedAt: true,
  organizationId: true,
  organization: { select: { id: true, name: true, type: true, inn: true } },
  ppoHeadOrganization: { select: { id: true, name: true, inn: true } },
  documents: {
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      fileName: true,
      filePath: true,
      signedFilePath: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
} as const;

export async function GET(
  _request: NextRequest,
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

    const { id } = await context.params;
    const member = await prisma.user.findUnique({
      where: { id },
      select: MEMBER_SELECT,
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (!member.organizationId || !scope.organizationIds.includes(member.organizationId)) {
      return NextResponse.json({ error: "Нет доступа к пользователю" }, { status: 403 });
    }

    return NextResponse.json({
      member: {
        ...member,
        effectiveOrganization: resolveEffectiveOrganization(member),
        effectiveWorkplace: resolveEffectiveWorkplace(member),
        effectiveWorkplaceInn: resolveEffectiveWorkplaceInn(member),
        chairmanOfOrganization: member.ppoHeadOrganization ?? null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[org-head/members/[id]] GET error:", msg);
    return NextResponse.json({ error: "Ошибка получения пользователя" }, { status: 500 });
  }
}

type UpdateBody = {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  organizationId?: string;
  membershipJoinedAt?: string | null;
};

export async function PATCH(
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

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as UpdateBody;

    const member = await prisma.user.findUnique({
      where: { id },
      select: { id: true, organizationId: true, isPPOHead: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    if (!member.organizationId || !scope.organizationIds.includes(member.organizationId)) {
      return NextResponse.json({ error: "Нет доступа к пользователю" }, { status: 403 });
    }

    const payload: Record<string, unknown> = {};
    if (body.firstName !== undefined) payload.firstName = body.firstName?.trim() || null;
    if (body.lastName !== undefined) payload.lastName = body.lastName?.trim() || null;
    if (body.middleName !== undefined) payload.middleName = body.middleName?.trim() || null;
    if (body.email !== undefined) {
      payload.email = body.email ? body.email.trim().toLowerCase() : null;
    }
    if (body.phone !== undefined) {
      payload.phone = body.phone ? normalizePhone(body.phone) : null;
    }
    if (body.jobTitle !== undefined) {
      payload.jobTitle = body.jobTitle ? body.jobTitle.trim() : null;
    }
    if (body.membershipJoinedAt !== undefined) {
      if (body.membershipJoinedAt) {
        const parsed = new Date(body.membershipJoinedAt);
        if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
          payload.membershipJoinedAt = parsed;
        }
      } else {
        payload.membershipJoinedAt = null;
      }
    }
    if (body.organizationId !== undefined) {
      if (member.isPPOHead) {
        return NextResponse.json(
          { error: "Организацию председателя нельзя менять через эту форму" },
          { status: 400 }
        );
      }
      if (!scope.organizationIds.includes(body.organizationId)) {
        return NextResponse.json(
          { error: "Можно переводить пользователя только в организацию из вашего контура" },
          { status: 403 }
        );
      }
      payload.organizationId = body.organizationId;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: payload,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        phone: true,
        jobTitle: true,
        membershipJoinedAt: true,
        organizationId: true,
        organization: { select: { id: true, name: true, type: true } },
      },
    });

    return NextResponse.json({ member: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[org-head/members/[id]] PATCH error:", msg);
    return NextResponse.json({ error: "Ошибка обновления пользователя" }, { status: 500 });
  }
}
