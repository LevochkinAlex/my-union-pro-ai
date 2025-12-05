import { prisma } from "@/lib/prisma";

/**
 * Получает или создает специального пользователя-бота для AI помощника
 */
export async function getOrCreateAIBotUser() {
  const BOT_EMAIL = "ai-assistant@myunion.pro";
  
  let botUser = await prisma.user.findUnique({
    where: { email: BOT_EMAIL },
  });

  if (!botUser) {
    botUser = await prisma.user.create({
      data: {
        email: BOT_EMAIL,
        firstName: "AI",
        lastName: "Помощник",
        phone: "+70000000000", // Фиктивный телефон
        role: "MEMBER", // Используем допустимое значение из enum UserRole
        membershipStatus: "APPROVED",
        emailVerified: new Date(),
        // Создаем пользователя без пароля (он не будет использоваться для входа)
      },
    });
  }

  return botUser;
}

