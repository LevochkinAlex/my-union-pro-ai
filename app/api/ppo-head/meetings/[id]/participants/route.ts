/**
 * POST /api/ppo-head/meetings/[id]/participants
 * Добавить участника заседания (из выборного органа). Используется при заполнении протокола:
 * список участников = сотрудники (с учётом тех, кто участвовал в повестке); недостающих добавляем в заседание.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const orgHead = await getOrgHead(session.user.id);
    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: meetingId } = await params;
    const body = await request.json();
    const { userId, userIds } = body;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, organizationId: true, participants: { select: { userId: true } } },
    });

    if (!meeting || meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Нет доступа к заседанию" }, { status: 403 });
    }

    const existingUserIds = new Set((meeting.participants || []).map((p) => p.userId).filter(Boolean));
    const toAdd: string[] = [];
    if (userIds && Array.isArray(userIds)) {
      userIds.forEach((uid: string) => {
        if (uid && !existingUserIds.has(uid)) {
          toAdd.push(uid);
          existingUserIds.add(uid);
        }
      });
    } else if (userId && typeof userId === "string") {
      if (!existingUserIds.has(userId)) toAdd.push(userId);
    }

    if (toAdd.length === 0) {
      return NextResponse.json({ added: 0, message: "Нет новых участников для добавления" });
    }

    await prisma.meetingParticipant.createMany({
      data: toAdd.map((uid) => ({
        meetingId,
        userId: uid,
        role: "MEMBER",
        attendance: "INVITED",
        canVote: true,
      })),
      skipDuplicates: true,
    });

    const updated = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      added: toAdd.length,
      meeting: updated,
      message: `Добавлено участников: ${toAdd.length}`,
    });
  } catch (error: unknown) {
    console.error("[ppo-head/meetings/[id]/participants] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при добавлении участника",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
