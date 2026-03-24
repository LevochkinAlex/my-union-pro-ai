import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { DocumentStatus } from "@prisma/client";
import { assignAgendaToParticipantsAndNotify } from "@/lib/meeting-agenda-notify";
import { ensureMeetingGroupChat, postMeetingChatSystemMessage } from "@/lib/meeting-chat";

/**
 * POST /api/ppo-head/meetings/[id]/documents/[documentId]/direct-approve
 * Прямое утверждение документа (только для повестки, без этапа согласования участниками).
 * Для протоколов используется send-for-approval + final-approve.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_approve");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: meetingId, documentId } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        participants: {
          include: {
            user: { select: { id: true } },
          },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    if (meeting.organizationId !== perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    const canApproveAgenda =
      perm.isChairman || (!!perm.roleName && /зам|заместитель/i.test(perm.roleName));

    if (!canApproveAgenda) {
      return NextResponse.json(
        { error: "Утвердить повестку могут только председатель или заместитель председателя" },
        { status: 403 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        meetingAsAgenda: { select: { id: true } },
        meetingAsProtocol: { select: { id: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    const documentMeetingId = document.meetingAsAgenda?.id || document.meetingAsProtocol?.id;
    if (documentMeetingId !== meetingId) {
      return NextResponse.json(
        { error: "Документ не связан с этим заседанием" },
        { status: 400 }
      );
    }

    // Прямое утверждение только для повестки (протоколы идут через согласование)
    if (!document.meetingAsAgenda) {
      return NextResponse.json(
        { error: "Прямое утверждение доступно только для повестки. Для протокола используйте «Отправить на согласование» и «Утвердить протокол»." },
        { status: 400 }
      );
    }

    if (document.status !== DocumentStatus.DRAFT) {
      return NextResponse.json(
        { error: "Утвердить можно только черновик повестки" },
        { status: 400 }
      );
    }

    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.COMPLETED,
        approvedById: session.user.id,
        approvedAt: new Date(),
      },
    });

    await prisma.documentStatusHistory.create({
      data: {
        documentId: document.id,
        status: DocumentStatus.COMPLETED,
        previousStatus: DocumentStatus.DRAFT,
        changedById: session.user.id,
        comment: "Повестка утверждена председателем (без согласования участниками)",
      },
    });

    // Рассылка участникам: повестка во входящие, push и email (без кнопок «Согласовать»/«Отклонить» в уведомлениях)
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { lastName: true, firstName: true },
    });
    const chairmanName = [currentUser?.lastName, currentUser?.firstName].filter(Boolean).join(" ") || "Председатель";
    try {
      await assignAgendaToParticipantsAndNotify(meetingId, session.user.id, chairmanName, { approvalRequired: false });
      const chatResult = await ensureMeetingGroupChat(meetingId);
      if (chatResult) {
        await postMeetingChatSystemMessage(
          meetingId,
          "Повестка дня утверждена председателем. Ознакомьтесь во вкладке «Входящие»."
        );
      }
    } catch (notifyErr) {
      console.error("[direct-approve] Ошибка рассылки повестки участникам:", notifyErr);
      // Не откатываем утверждение — рассылку можно повторить через «Отправить уведомления»
    }

    return NextResponse.json({
      document: updatedDocument,
      message: "Повестка успешно утверждена",
    });
  } catch (error: unknown) {
    console.error("[direct-approve] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при утверждении документа",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
