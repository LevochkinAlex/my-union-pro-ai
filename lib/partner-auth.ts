import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function ensurePartner() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }), partner: null };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      partnerRecordId: true,
      partnerRecord: { select: { id: true, moderationStatus: true } },
    },
  });
  if (!user || user.role !== "PARTNER" || !user.partnerRecordId || !user.partnerRecord) {
    return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }), partner: null };
  }
  if (user.partnerRecord.moderationStatus === "BLOCKED") {
    return {
      error: NextResponse.json(
        {
          error: "Кабинет партнёра заблокирован. Обратитесь в профсоюз или дождитесь снятия блокировки.",
          code: "PARTNER_BLOCKED",
        },
        { status: 403 }
      ),
      partner: null,
    };
  }
  return { error: null, partner: { id: user.partnerRecordId, userId: session.user.id } };
}
