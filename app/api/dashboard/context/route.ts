/**
 * GET /api/dashboard/context
 * Контекст дашборда: председатель/сотрудник и права (для отображения интерфейса ППО сотрудникам).
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { isDemoUserId, getDemoDashboardContext } from "@/lib/demo";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ isChairman: false, isStaff: false, permissions: {} }, { status: 200 });
    }

    if (isDemoUserId(session.user.id)) {
      return NextResponse.json(getDemoDashboardContext(session.user.id));
    }

    const result = await checkUserPermissions(session.user.id);
    return NextResponse.json({
      isChairman: result.isChairman,
      isStaff: result.isStaff,
      permissions: result.permissions ?? {},
      organizationId: result.organizationId ?? null,
      roleName: result.roleName ?? null,
    });
  } catch (e) {
    console.warn("[api/dashboard/context]", e);
    return NextResponse.json(
      { isChairman: false, isStaff: false, permissions: {} },
      { status: 200 }
    );
  }
}
