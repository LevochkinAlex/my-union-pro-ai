import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function ensureSuperAdmin(): Promise<
  { session: Session; error: null } | { session: null; error: NextResponse }
> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      session: null,
      error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }),
    };
  }

  if (session.user.role !== "SUPER_ADMIN") {
    return {
      session: null,
      error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }),
    };
  }

  return { session, error: null };
}
