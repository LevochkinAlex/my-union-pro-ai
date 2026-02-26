import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableViewModes } from "@/lib/session-user";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      viewMode: true,
      isPPOHead: true,
      ppoHeadOrganizationId: true,
      isMPOHead: true,
      mpoHeadOrganizationId: true,
      isRPOHead: true,
      rpoHeadOrganizationId: true,
    },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const fakeSession = { user: dbUser } as any;
  const modes = getAvailableViewModes(fakeSession);

  return NextResponse.json({
    dbUser,
    modes,
    modesCount: modes.length,
    shouldShowSwitch: modes.length > 1,
  });
}
