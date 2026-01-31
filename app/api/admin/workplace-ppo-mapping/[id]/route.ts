import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/admin/workplace-ppo-mapping/[id]
 * Удалить связь место работы → ППО
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== "SUPER_ADMIN" && user?.role !== "PPO_HEAD") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID не указан" }, { status: 400 });
    }

    await prisma.workplacePPOMapping.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[admin/workplace-ppo-mapping] DELETE error:", error);
    return NextResponse.json(
      { error: error?.message || "Ошибка удаления" },
      { status: 500 }
    );
  }
}
