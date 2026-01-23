import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * GET /api/ppo-head/appeals
 * Получить список обращений для Председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const userId = searchParams.get("userId"); // Фильтр по конкретному пользователю
    
    console.log("[ppo-head/appeals] Request params:", { status, userId, chairmanId: chairman.organizationId });

    // Получаем чаты председателя, чтобы показывать обращения из этих чатов
    const chairmanChats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: session.user.id,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
      },
    });

    const chairmanChatIds = chairmanChats.map(chat => chat.id);

    // Формируем условия фильтрации:
    // 1. Обращения из организации председателя
    // 2. Обращения, связанные с чатами председателя (для старых обращений без organizationId)
    const orConditions: any[] = [];
    
    // Обращения из организации председателя
    if (chairman?.organizationId) {
      orConditions.push({ organizationId: chairman.organizationId });
    }
    
    // Обращения из чатов председателя (для старых обращений)
    if (chairmanChatIds.length > 0) {
      orConditions.push({ chatId: { in: chairmanChatIds } });
    }
    
    // Если нет условий для OR, возвращаем пустой результат
    // (председатель без организации и без чатов не должен видеть обращения)
    // Важно: Prisma не поддерживает пустой массив в OR (генерирует "AND 1=0"),
    // поэтому проверяем длину перед использованием OR
    let where: any;
    
    // Если указан userId, показываем все обращения этого пользователя
    // В контексте карточки члена профсоюза председатель должен видеть все его обращения
    // независимо от организации, так как это его подопечный
    if (userId) {
      // Проверяем, что пользователь действительно является членом организации председателя
      const member = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          organizationId: true,
          firstName: true,
          lastName: true,
        },
      });
      
      console.log("[ppo-head/appeals] Member check:", { 
        memberId: userId, 
        memberOrgId: member?.organizationId, 
        chairmanOrgId: chairman.organizationId,
        isMember: !!member,
      });
      
      if (!member) {
        console.log("[ppo-head/appeals] Member not found:", userId);
        return NextResponse.json({
          success: true,
          tickets: [],
        });
      }
      
      // Показываем все обращения этого пользователя
      where = {
        userId: userId,
      };
      console.log("[ppo-head/appeals] Filtering by userId:", userId);
    } else {
      // Если userId не указан, используем стандартную логику фильтрации по организации/чатам
      if (orConditions.length > 0) {
        where = { OR: orConditions };
      } else {
        // Используем несуществующий ID для гарантированного пустого результата
        where = { id: 'never-match' };
      }
      console.log("[ppo-head/appeals] Filtering by organization/chats, orConditions:", orConditions.length);
    }

    if (status && status !== "all") {
      where.status = status;
    }

    console.log("[ppo-head/appeals] Final where clause:", JSON.stringify(where, null, 2));

    // Дополнительная диагностика: проверяем, сколько обращений есть у пользователя вообще
    if (userId) {
      const allUserTickets = await prisma.ticket.findMany({
        where: { userId },
        select: { id: true, publicId: true, status: true, organizationId: true, chatId: true },
      });
      console.log("[ppo-head/appeals] All tickets for user:", {
        userId,
        totalCount: allUserTickets.length,
        tickets: allUserTickets.map(t => ({
          id: t.id,
          publicId: t.publicId,
          status: t.status,
          organizationId: t.organizationId,
          chatId: t.chatId,
        })),
      });
    }

    let tickets;
    try {
      tickets = await prisma.ticket.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              email: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
          comments: {
            select: {
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      console.log("[ppo-head/appeals] Found tickets:", tickets.length);
    } catch (dbError: any) {
      console.error("[ppo-head/appeals] Database query error:", dbError);
      console.error("[ppo-head/appeals] Database error details:", {
        message: dbError.message,
        code: dbError.code,
        meta: dbError.meta,
      });
      throw new Error(`Ошибка запроса к базе данных: ${dbError.message}`);
    }

    // Безопасное преобразование данных
    try {
      const formattedTickets = tickets.map((ticket) => {
        try {
          return {
            id: ticket.id,
            publicId: ticket.publicId,
            type: ticket.type,
            status: ticket.status,
            priority: ticket.priority,
            title: ticket.title,
            content: ticket.content,
            createdAt: ticket.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: ticket.updatedAt?.toISOString() || new Date().toISOString(),
            user: {
              id: ticket.user?.id || "",
              firstName: ticket.user?.firstName || null,
              lastName: ticket.user?.lastName || null,
              middleName: ticket.user?.middleName || null,
              email: ticket.user?.email || null,
              avatarUrl: ticket.user?.avatarUrl || null,
            },
            commentsCount: ticket._count?.comments || 0,
            lastCommentAt: ticket.comments?.[0]?.createdAt 
              ? (ticket.comments[0].createdAt instanceof Date 
                  ? ticket.comments[0].createdAt.toISOString() 
                  : new Date(ticket.comments[0].createdAt).toISOString())
              : null,
            chatId: ticket.chatId,
            rejectionReason: ticket.rejectionReason,
            helpfulRating: ticket.helpfulRating,
            helpfulRatingComment: ticket.helpfulRatingComment,
            helpfulRatingAt: ticket.helpfulRatingAt?.toISOString() || null,
            // Информация о сроках ответа
            responseDeadline: ticket.responseDeadline?.toISOString() || null,
            lastResponseAt: ticket.lastResponseAt?.toISOString() || null,
            lastUserResponseAt: ticket.lastUserResponseAt?.toISOString() || null,
            userResponseDeadline: ticket.userResponseDeadline?.toISOString() || null,
            isOverdue: ticket.isOverdue || false,
            autoClosedAt: ticket.autoClosedAt?.toISOString() || null,
          };
        } catch (mapError: any) {
          console.error(`[ppo-head/appeals] Error mapping ticket ${ticket.id}:`, mapError);
          // Возвращаем минимальные данные, если не удалось отформатировать
          return {
            id: ticket.id,
            publicId: ticket.publicId || "",
            type: ticket.type,
            status: ticket.status,
            priority: ticket.priority || "MEDIUM",
            title: ticket.title || "Без названия",
            content: ticket.content || "",
            createdAt: ticket.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: ticket.updatedAt?.toISOString() || new Date().toISOString(),
            user: {
              id: ticket.user?.id || "",
              firstName: null,
              lastName: null,
              middleName: null,
              email: null,
              avatarUrl: null,
            },
            commentsCount: 0,
            lastCommentAt: null,
            chatId: ticket.chatId,
            rejectionReason: ticket.rejectionReason,
            helpfulRating: ticket.helpfulRating,
            helpfulRatingComment: ticket.helpfulRatingComment,
            helpfulRatingAt: ticket.helpfulRatingAt?.toISOString() || null,
          };
        }
      });

      return NextResponse.json({
        success: true,
        tickets: formattedTickets,
      });
    } catch (formatError: any) {
      console.error("[ppo-head/appeals] Format error:", formatError);
      throw new Error(`Ошибка форматирования данных: ${formatError.message}`);
    }
  } catch (error: any) {
    console.error("[ppo-head/appeals] GET error:", error);
    console.error("[ppo-head/appeals] Error name:", error.name);
    console.error("[ppo-head/appeals] Error message:", error.message);
    console.error("[ppo-head/appeals] Error stack:", error.stack);
    
    // Дополнительная информация об ошибке
    if (error.code) {
      console.error("[ppo-head/appeals] Error code:", error.code);
    }
    if (error.meta) {
      console.error("[ppo-head/appeals] Error meta:", error.meta);
    }
    
    return NextResponse.json(
      {
        error: "Ошибка при получении обращений",
        message: error.message || "Неизвестная ошибка",
        code: error.code || undefined,
        details: process.env.NODE_ENV === "development" ? {
          message: error.message,
          name: error.name,
          code: error.code,
          stack: error.stack,
        } : undefined,
      },
      { status: 500 }
    );
  }
}

