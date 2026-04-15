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
    select: { role: true, partnerRecordId: true, partnerRecord: { select: { id: true } } },
  });
  if (!user || user.role !== "PARTNER" || !user.partnerRecordId) {
    return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }), partner: null };
  }
  return { error: null, partner: { id: user.partnerRecordId, userId: session.user.id } };
}
