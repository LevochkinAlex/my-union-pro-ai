import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { normalizePhone } from "@/lib/utils/phone";

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

export async function GET(
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
    const member = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        phone: true,
        jobTitle: true,
        membershipStatus: true,
        unionMembershipStatus: true,
        role: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
        createdAt: true,
        membershipJoinedAt: true,
        membershipExcludedAt: true,
        membershipExclusionReason: true,
        dateOfBirth: true,
        address: true,
        workplace: true,
        unionCardNumber: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, type: true },
        },
        ppoHeadOrganization: {
          select: { id: true, name: true },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (!member.organizationId || !scope.organizationIds.includes(member.organizationId)) {
      return NextResponse.json({ error: "Нет доступа к пользователю" }, { status: 403 });
    }

    return NextResponse.json({ member });
  } catch (error: any) {
    console.error("[org-head/members/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка получения пользователя", details: error?.message },
      { status: 500 }
    );
  }
}

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
          { error: "Можно переводить пользователя только в организацию из вашего scope" },
          { status: 403 }
        );
      }
      payload.organizationId = body.organizationId;
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
        organizationId: true,
        organization: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    return NextResponse.json({ member: updated });
  } catch (error: any) {
    console.error("[org-head/members/[id]] PATCH error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления пользователя", details: error?.message },
      { status: 500 }
    );
  }
}

