import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import { 
  getUserChats, 
  getOrCreatePrivateChat,
  ChatFilter 
} from "@/lib/chat-service";
import { withCache, getCacheKey } from "@/lib/cache";
import * as Sentry from "@sentry/nextjs";
import { 
  registerMatrixUser, 
  loginMatrixUser, 
  generateMatrixUsername 
} from '@/lib/matrix-client';

// GET - получение списка чатов пользователя
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);

    // Получаем параметры фильтрации
    const filter: ChatFilter = {};
    
    const typeParam = searchParams.get("type");
    if (typeParam === "PRIVATE" || typeParam === "GROUP") {
      filter.type = typeParam;
    }

    const hasTicketParam = searchParams.get("hasTicket");
    if (hasTicketParam === "true") {
      filter.hasTicket = true;
    } else if (hasTicketParam === "false") {
      filter.hasTicket = false;
    }

    // Кешируем список чатов на короткое время (15 сек)
    const cacheKey = getCacheKey(`user:chats:${userId}`, filter);
    
    const chats = await Sentry.startSpan(
      {
        op: "db.query",
        name: "GET /api/chat - fetch user chats",
      },
      async (span) => {
        span.setAttribute("userId", userId);
        return withCache(
          cacheKey,
          () => getUserChats(userId, filter),
          15 // 15 секунд кеш
        );
      }
    );

    // Форматируем для совместимости с существующим фронтендом
    const formattedChats = chats.map((chat) => ({
      id: chat.id,
      type: chat.type,
      name: chat.name,
      description: chat.description,
      iconUrl: chat.iconUrl,
      isPublic: chat.isPublic,
      otherUser: chat.otherUser,
      lastMessage: chat.lastMessage,
      lastMessageAt: chat.lastMessageAt,
      unreadCount: chat.unreadCount,
      createdAt: chat.createdAt,
      ticketId: chat.ticketId,
      ticketPublicId: chat.ticketPublicId,
      ticketTitle: chat.ticketTitle,
      participants: chat.participants,
      participantsCount: chat.participantsCount,
      _count: {
        participants: chat.participantsCount,
      },
    }));

    return NextResponse.json({ chats: formattedChats });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[chat] GET Error:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.substring(0, 500),
    });
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

// POST - создание нового чата или получение существующего
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const { targetUserId } = await request.json();

    if (!targetUserId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    if (userId === targetUserId) {
      return NextResponse.json({ error: "Нельзя создать чат с самим собой" }, { status: 400 });
    }

    // Проверяем существование целевого пользователя
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { 
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
        phone: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Используем новый сервис
    console.log(`[chat] POST: Creating chat between ${userId} and ${targetUserId}`);
    let chat, isNew;
    try {
      const result = await getOrCreatePrivateChat(userId, targetUserId);
      chat = result.chat;
      isNew = result.isNew;
      console.log(`[chat] POST: Chat ${chat.id} ${isNew ? 'created' : 'found'}`);
    } catch (error: any) {
      console.error('[chat] POST: Error in getOrCreatePrivateChat:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
      });
      throw error;
    }

    // Если чат новый и у него нет matrixRoomId, создаем Matrix комнату
    if (isNew && !chat.matrixRoomId) {
      try {
        // Get Matrix credentials for current user
        const currentUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { 
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            matrixUserId: true, 
            matrixAccessToken: true 
          },
        });

        const targetUserMatrix = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { matrixUserId: true },
        });

        if (!currentUser || !targetUserMatrix?.matrixUserId) {
          console.error('[chat] Missing Matrix credentials:', {
            currentUserExists: !!currentUser,
            currentUserHasMatrix: !!currentUser?.matrixUserId,
            targetUserHasMatrix: !!targetUserMatrix?.matrixUserId,
          });
        } else {
          // Get or create Matrix access token (similar to /api/chat/matrix/auth)
          let accessToken = currentUser.matrixAccessToken;
          
          // Validate existing token
          if (accessToken) {
            const validateResp = await fetch(`${process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro'}/_matrix/client/v3/account/whoami`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (!validateResp.ok) {
              // Token invalid, need to get new one
              accessToken = null;
            }
          }
          
          // If no valid token, try to use admin API or get new token via internal call
          if (!accessToken) {
            // Try to use admin API to create room directly
            const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;
            const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
            
            if (MATRIX_ADMIN_TOKEN && currentUser.matrixUserId && targetUserMatrix.matrixUserId) {
              try {
                // Create room using admin API
                const createRoomResp = await fetch(`${MATRIX_SERVER}/_matrix/client/v3/createRoom`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MATRIX_ADMIN_TOKEN}`
                  },
                  body: JSON.stringify({
                    preset: 'trusted_private_chat',
                    is_direct: true,
                    invite: [targetUserMatrix.matrixUserId],
                    creation_content: {
                      'm.federate': false
                    }
                  })
                });

                if (createRoomResp.ok) {
                  const roomData = await createRoomResp.json();
                  const matrixRoomId = roomData.room_id;

                  // Join both users to the room using admin API
                  if (matrixRoomId) {
                    // Join current user
                    await fetch(`${MATRIX_SERVER}/_synapse/admin/v1/join/${encodeURIComponent(matrixRoomId)}`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${MATRIX_ADMIN_TOKEN}`
                      },
                      body: JSON.stringify({
                        user_id: currentUser.matrixUserId
                      })
                    }).catch(err => console.error('[chat] Failed to join current user:', err));

                    // Join target user
                    await fetch(`${MATRIX_SERVER}/_synapse/admin/v1/join/${encodeURIComponent(matrixRoomId)}`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${MATRIX_ADMIN_TOKEN}`
                      },
                      body: JSON.stringify({
                        user_id: targetUserMatrix.matrixUserId
                      })
                    }).catch(err => console.error('[chat] Failed to join target user:', err));

                    // Update chat with matrixRoomId
                    await prisma.chat.update({
                      where: { id: chat.id },
                      data: { matrixRoomId },
                    });
                    
                    console.log(`[chat] Created Matrix room ${matrixRoomId} for chat ${chat.id} using admin API`);
                  }
                } else {
                  console.error('[chat] Failed to create Matrix room via admin API:', await createRoomResp.text());
                }
              } catch (error) {
                console.error('[chat] Error creating Matrix room via admin API:', error);
              }
            } else {
              console.warn('[chat] Cannot create Matrix room - missing admin token or Matrix user IDs');
            }
          } else if (accessToken && targetUserMatrix.matrixUserId) {
            // Use regular API with access token
            const { createDirectRoom } = await import('@/lib/matrix-client');
            
            // Create Matrix room
            const matrixRoomId = await createDirectRoom(
              accessToken,
              targetUserMatrix.matrixUserId
            );

            if (matrixRoomId) {
              // Update chat with matrixRoomId
              await prisma.chat.update({
                where: { id: chat.id },
                data: { matrixRoomId },
              });
              
              console.log(`[chat] Created Matrix room ${matrixRoomId} for chat ${chat.id}`);
            } else {
              console.error('[chat] Failed to create Matrix room');
            }
          }
        }
      } catch (error) {
        console.error('[chat] Error creating Matrix room:', error);
        // Don't fail the request - chat is created in DB, Matrix room can be created later
      }
    }

    // Reload chat to get updated matrixRoomId if it was just created
    const updatedChat = await prisma.chat.findUnique({
      where: { id: chat.id },
      select: { matrixRoomId: true },
    });

    const finalMatrixRoomId = updatedChat?.matrixRoomId || chat.matrixRoomId;
    
    console.log(`[chat] POST response for chat ${chat.id}:`, {
      isNew,
      matrixRoomId: finalMatrixRoomId,
      hadMatrixRoomIdInitially: !!chat.matrixRoomId,
      gotMatrixRoomIdAfterUpdate: !!updatedChat?.matrixRoomId,
    });

    // Нормализуем аватарку
    const normalizedUser = normalizeUserAvatar(targetUser);

    console.log(`[chat] POST: Successfully returning chat ${chat.id}`);

    return NextResponse.json({
      chat: {
        id: chat.id,
        matrixRoomId: finalMatrixRoomId,
        isNew,
        otherUser: {
          id: normalizedUser.id,
          firstName: normalizedUser.firstName,
          lastName: normalizedUser.lastName,
          middleName: normalizedUser.middleName,
          avatarUrl: normalizedUser.avatarUrl,
          phone: normalizedUser.phone,
        },
      },
    });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[chat] POST Error:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.substring(0, 500),
    });
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
