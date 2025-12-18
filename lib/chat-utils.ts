import { ChatUser } from "@/types/chat";
import { getFileUrlWithCDN, getFileUrlByCategory } from "@/lib/cdn";
import { prisma } from "@/lib/prisma";
import { formatFileSize as formatFileSizeUtil } from "@/lib/file-utils";

/**
 * Получить полное имя пользователя
 * В русской традиции: Фамилия Имя Отчество
 */
export function getUserName(user: ChatUser | any | null | undefined): string {
  if (!user) return "Пользователь";
  const parts = [user.lastName, user.firstName, user.middleName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Пользователь";
}

/**
 * Получить инициалы пользователя
 */
export function getInitials(user: ChatUser | any | null | undefined): string {
  if (!user) return "?";
  const first = user.firstName?.[0]?.toUpperCase() || "";
  const last = user.lastName?.[0]?.toUpperCase() || "";
  return (first + last) || "?";
}

/**
 * Форматировать время сообщения
 */
export function formatTime(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/**
 * Форматировать дату для группировки сообщений
 */
export function formatMessageDate(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Сегодня";
  } else if (diffDays === 1) {
    return "Вчера";
  } else if (diffDays < 7) {
    return date.toLocaleDateString("ru-RU", { weekday: "long" });
  } else {
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

/**
 * Получить URL файла с CDN
 */
export function getFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  
  // Если это data URL или уже полный URL
  if (filePath.startsWith("data:") || filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  // Если это путь к документу, используем CDN для documents
  if (filePath.includes("/documents/") || filePath.includes("documents-")) {
    const filename = filePath.split("/").pop() || filePath;
    return getFileUrlByCategory("documents", filename);
  }

  return getFileUrlWithCDN(filePath, true);
}

/**
 * Форматировать размер файла
 */
export function formatFileSize(bytes: number): string {
  return formatFileSizeUtil(bytes);
}

/**
 * Создает или находит личный чат между двумя пользователями
 * Нормализует ID участников: меньший ID всегда будет participant1Id
 * @param userId1 ID первого пользователя
 * @param userId2 ID второго пользователя
 * @returns Chat объект
 */
export async function getOrCreatePrivateChat(
  userId1: string,
  userId2: string
) {
  // Нормализуем ID участников: меньший ID всегда participant1Id
  const participant1Id = userId1 < userId2 ? userId1 : userId2;
  const participant2Id = userId1 < userId2 ? userId2 : userId1;

  // Ищем существующий чат
  let chat = await prisma.chat.findFirst({
    where: {
      type: "PRIVATE",
      participant1Id,
      participant2Id,
    },
  });

  // Если чат не найден, создаем новый
  if (!chat) {
    chat = await prisma.chat.create({
      data: {
        type: "PRIVATE",
        participant1Id,
        participant2Id,
      },
    });
  }

  return chat;
}

/**
 * Отправляет сообщение в чат и обновляет последнее сообщение
 * @param chatId ID чата
 * @param senderId ID отправителя
 * @param content Содержимое сообщения
 */
export async function sendChatMessage(
  chatId: string,
  senderId: string,
  content: string
) {
  // Получаем информацию о чате для определения, кого пометить как непрочитанное
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { participant1Id: true, participant2Id: true },
  });

  // Определяем, кого пометить как непрочитанное
  const updateData: any = {
    lastMessageAt: new Date(),
    lastMessage: content.length > 100 ? content.substring(0, 100) + "..." : content,
  };

  if (chat?.participant1Id === senderId) {
    updateData.participant2ReadAt = null;
  } else if (chat?.participant2Id === senderId) {
    updateData.participant1ReadAt = null;
  }

  // Создаем сообщение и обновляем чат параллельно
  await Promise.all([
    prisma.chatMessage.create({
      data: {
        chatId,
        senderId,
        content,
      },
    }),
    prisma.chat.update({
      where: { id: chatId },
      data: updateData,
    }),
  ]);
}
