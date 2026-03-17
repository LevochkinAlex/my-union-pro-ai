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
        firstName: "ИИ",
        lastName: "Ассистент",
        phone: "+70000000000", // Фиктивный телефон
        role: "MEMBER", // Используем допустимое значение из enum UserRole
        membershipStatus: "APPROVED",
        emailVerified: new Date(),
        // Создаем пользователя без пароля (он не будет использоваться для входа)
      },
    });
  } else if (botUser.firstName !== "ИИ" || botUser.lastName !== "Ассистент") {
    botUser = await prisma.user.update({
      where: { id: botUser.id },
      data: { firstName: "ИИ", lastName: "Ассистент" },
    });
  }

  return botUser;
}

