import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { 
  requireChatAccess, 
  ChatAccessError 
} from "@/lib/chat-service";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "chat");

// PATCH - редактирование сообщения
export async function PATCH(
  request: NextRequest,
  { params }: { params: { chatId: string; messageId: string } | Promise<{ chatId: string; messageId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { chatId, messageId } = resolvedParams;
    const userId = session.user.id;

    // Проверяем доступ через сервис
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Парсим тело запроса
    const contentType = request.headers.get("content-type") || "";
    let content = "";
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      content = (formData.get("content") as string) || "";
      file = formData.get("file") as File | null;
    } else {
      const body = await request.json();
      content = body.content || "";
    }

    if (!content.trim() && !file) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    // TODO: Редактирование сообщений теперь через Matrix API
    return NextResponse.json(
      { error: "Редактирование сообщений временно недоступно (миграция на Matrix API)" },
      { status: 501 }
    );
  } catch (error: any) {
    console.error("[chat] PATCH Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// DELETE - удаление сообщения
export async function DELETE(
  request: NextRequest,
  { params }: { params: { chatId: string; messageId: string } | Promise<{ chatId: string; messageId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { chatId, messageId } = resolvedParams;
    const userId = session.user.id;

    // Проверяем доступ через сервис
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // TODO: Удаление сообщений теперь через Matrix API (redact)
    return NextResponse.json(
      { error: "Удаление сообщений временно недоступно (миграция на Matrix API)" },
      { status: 501 }
    );
  } catch (error: any) {
    console.error("[chat] DELETE Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
