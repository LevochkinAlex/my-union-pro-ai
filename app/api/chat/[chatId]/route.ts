import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";

// GET - получение сообщений чата
export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем доступность prisma
    if (!prisma || !prisma.chat || !prisma.chatMessage) {
      console.error("[chat] GET: Prisma client or models are not available");
      return NextResponse.json(
        { error: "Ошибка инициализации базы данных" },
        { status: 500 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем, что пользователь является участником чата
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Получаем сообщения (исключаем удаленные)
    const messages = await prisma.chatMessage.findMany({
      where: { 
        chatId,
        deletedAt: null, // Не показываем удаленные сообщения
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                avatarUrl: true,
              },
            },
          },
        },
        forwardedFrom: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                avatarUrl: true,
              },
            },
          },
        },
      } as any,
      orderBy: {
        createdAt: "asc",
      },
    });

    // Отмечаем сообщения как прочитанные и обновляем время активности
    // Это используется для определения, открыт ли чат (для пуш-уведомлений)
    await prisma.chat.update({
      where: { id: chatId },
      data: chat.participant1Id === userId
        ? { participant1ReadAt: new Date() }
        : { participant2ReadAt: new Date() },
    });

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error("[chat] GET Error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
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

// POST - отправка сообщения в чат
export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем доступность prisma
    if (!prisma || !prisma.chat || !prisma.chatMessage) {
      console.error("[chat] POST: Prisma client or models are not available");
      return NextResponse.json(
        { error: "Ошибка инициализации базы данных" },
        { status: 500 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;
    const { content, replyToId } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    // Проверяем, что сообщение для ответа существует и принадлежит этому чату
    if (replyToId) {
      const replyToMessage = await prisma.chatMessage.findUnique({
        where: { id: replyToId },
        select: { chatId: true },
      });

      if (!replyToMessage) {
        return NextResponse.json({ error: "Сообщение для ответа не найдено" }, { status: 404 });
      }

      if (replyToMessage.chatId !== chatId) {
        return NextResponse.json({ error: "Сообщение для ответа не принадлежит этому чату" }, { status: 403 });
      }
    }

    // Проверяем, что пользователь является участником чата
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Создаем сообщение
    const message = await prisma.chatMessage.create({
      data: {
        chatId,
        senderId: userId,
        content: content.trim(),
        replyToId: replyToId || null,
      } as any,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Определяем получателя сообщения
    const recipientId = chat.participant1Id === userId 
      ? chat.participant2Id 
      : chat.participant1Id;

    // Получаем информацию о чате с временем последнего чтения
    const chatWithReadTime = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participant1ReadAt: true,
        participant2ReadAt: true,
      },
    });

    // Проверяем, открыт ли чат у получателя
    // Чат считается открытым, если получатель запрашивал сообщения в последние 30 секунд
    const recipientReadAt = chat.participant1Id === userId
      ? chatWithReadTime?.participant2ReadAt
      : chatWithReadTime?.participant1ReadAt;

    const isChatOpen = recipientReadAt 
      ? (Date.now() - new Date(recipientReadAt).getTime()) < 30000 // 30 секунд
      : false;

    // Обновляем последнее сообщение в чате
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessage: content.trim().substring(0, 100), // Первые 100 символов
        lastMessageAt: new Date(),
        // Сбрасываем прочитанность для получателя
        ...(chat.participant1Id === userId
          ? { participant2ReadAt: null }
          : { participant1ReadAt: null }),
      },
    });

    // Отправляем пуш-уведомление получателю
    // Отправляем всегда, но логируем статус открытости чата
    try {
      // Получаем информацию об отправителе для уведомления
      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          middleName: true,
        },
      });

      const senderName = sender 
        ? `${sender.firstName || ""} ${sender.middleName || ""} ${sender.lastName || ""}`.trim() || "Пользователь"
        : "Пользователь";

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://myunion.pro";
      const messagePreview = content.trim().substring(0, 100);

      console.log("[chat] 📤 Отправка пуш-уведомления получателю:", {
        recipientId,
        senderName,
        chatId,
        isChatOpen,
        messagePreview: messagePreview.substring(0, 50),
      });

      const notificationResult = await sendNotification({
        userId: recipientId,
        title: `💬 Новое сообщение от ${senderName}`,
        message: messagePreview,
        link: `${baseUrl}/dashboard/chat?userId=${userId}`,
        data: {
          type: "chat_message",
          chatId: chatId,
          senderId: userId,
        },
      });

      console.log("[chat] ✅ Пуш-уведомление отправлено получателю:", {
        pushSuccess: notificationResult.push.successCount,
        pushFailed: notificationResult.push.failureCount,
        emailSent: notificationResult.email.sent,
        emailFailed: notificationResult.email.failed,
        isChatOpen,
      });
    } catch (notificationError: any) {
      console.error("[chat] ⚠️ Ошибка отправки пуш-уведомления:", {
        error: notificationError?.message,
        stack: notificationError?.stack,
        recipientId,
        chatId,
      });
      // Не прерываем отправку сообщения из-за ошибки уведомления
    }

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("[chat] POST Error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
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

