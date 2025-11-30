import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push-notifications";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { sendEmail } from "@/lib/email";

/**
 * Отправляет системное сообщение в чат пользователя
 */
export async function sendSystemMessage(
  userId: string,
  content: string,
  sessionId?: string,
  options?: {
    sendPush?: boolean;
    sendEmail?: boolean;
    sendTelegram?: boolean;
    pushTitle?: string;
    emailSubject?: string;
  }
) {
  try {
    // Находим или создаем сессию "Мой чат"
    let session = await prisma.chatSession.findFirst({
      where: {
        userId,
        type: "STATEMENT",
        title: { contains: "Мой чат" },
      },
    });

    if (!session) {
      // Создаем сессию "Мой чат" если её нет
      session = await prisma.chatSession.create({
        data: {
          userId,
          title: "Мой чат",
          type: "STATEMENT",
        },
      });
    }

    // Создаем системное сообщение
    const message = await prisma.chatMessage.create({
      data: {
        userId,
        sessionId: sessionId || session.id,
        role: "assistant",
        content,
        isSystemMessage: true,
      },
    });

    // Получаем пользователя для отправки уведомлений
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        telegramChatId: true,
        pushNotificationsEnabled: true,
        emailBotNotifications: true,
      },
    });

    // Отправляем push-уведомление
    if (options?.sendPush !== false && user?.pushNotificationsEnabled) {
      try {
        await sendPushNotification(userId, {
          title: options?.pushTitle || "МойСоюз",
          body: content.replace(/<[^>]*>/g, "").substring(0, 100), // Убираем HTML и обрезаем
          url: `/dashboard?session=${session.id}`,
        });
      } catch (error) {
        console.error("[system-messages] Push notification error:", error);
      }
    }

    // Отправляем email
    if (options?.sendEmail && user?.email && user?.emailBotNotifications) {
      try {
        await sendEmail(
          user.email,
          options?.emailSubject || "Уведомление от МойСоюз",
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${options?.emailSubject || "Уведомление от МойСоюз"}</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${content.replace(/\n/g, "<br>")}
            </div>
            <p style="color: #666; font-size: 14px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/dashboard?session=${session.id}" 
                 style="color: #0066cc; text-decoration: none;">
                Открыть в МойСоюз →
              </a>
            </p>
          </div>`,
          content.replace(/<[^>]*>/g, "")
        );
      } catch (error) {
        console.error("[system-messages] Email error:", error);
      }
    }

    // Отправляем в Telegram
    if (options?.sendTelegram && user?.telegramChatId) {
      try {
        await sendTelegramMessage(
          user.telegramChatId,
          `🔔 *${options?.pushTitle || "МойСоюз"}*\n\n${content.replace(/<[^>]*>/g, "")}`
        );
      } catch (error) {
        console.error("[system-messages] Telegram error:", error);
      }
    }

    return message;
  } catch (error) {
    console.error("[system-messages] Error sending system message:", error);
    throw error;
  }
}

/**
 * Системные сообщения для разных этапов
 */
export const SystemMessages = {
  /**
   * Профиль заполнен - можно генерировать документы
   */
  async profileCompleted(userId: string) {
    return sendSystemMessage(
      userId,
      `✅ Вы успешно заполнили свою анкету!\n\nТеперь вы можете сгенерировать документы для вступления в профсоюз.\n\n[GENERATE_DOCUMENTS_BUTTON]`,
      undefined,
      {
        sendPush: true,
        sendEmail: true,
        sendTelegram: true,
        pushTitle: "Анкета заполнена",
        emailSubject: "Анкета заполнена - готовы к генерации документов",
      }
    );
  },

  /**
   * Документы сгенерированы
   */
  async documentsGenerated(userId: string, documents: Array<{ type: string; title: string; filePath: string }>) {
    const docsList = documents
      .map((doc) => `• ${doc.title}`)
      .join("\n");

    return sendSystemMessage(
      userId,
      `📄 Готово, ваши документы сгенерированы:\n\n${docsList}\n\nВы можете скачать их, распечатать, подписать и загрузить обратно.`,
      undefined,
      {
        sendPush: true,
        sendEmail: true,
        sendTelegram: true,
        pushTitle: "Документы готовы",
        emailSubject: "Документы для вступления в профсоюз готовы",
      }
    );
  },

  /**
   * Инструкция по загрузке документов
   */
  async uploadDocumentsInstruction(userId: string) {
    return sendSystemMessage(
      userId,
      `📎 Вы можете прикрепить подписанные документы прямо в чат (используйте кнопку прикрепления файла) или воспользоваться разделом "Документы" в меню.`,
      undefined,
      {
        sendPush: false, // Не спамить
        sendEmail: false,
        sendTelegram: false,
      }
    );
  },

  /**
   * Документы загружены и отправлены на проверку
   */
  async documentsSubmitted(userId: string) {
    return sendSystemMessage(
      userId,
      `✅ Спасибо за ваши документы!\n\nОни направлены руководителю на проверку. Ожидайте, пожалуйста, валидацию.\n\nКак только вы будете приняты в члены профсоюза, для вас откроются все привилегии:\n\n✨ **Доступ к скидкам BestBenefits** - эксклюзивные предложения от партнеров профсоюза\n📚 **Юридическая поддержка** - консультации по трудовому праву\n🎁 **Социальные программы** - помощь в сложных жизненных ситуациях\n📢 **Участие в жизни профсоюза** - голосование, собрания, инициативы\n🏥 **Медицинская поддержка** - программы оздоровления и профилактики\n🎓 **Образовательные программы** - курсы повышения квалификации\n\nПосле одобрения вы сможете общаться с AI-помощником и задавать любые вопросы!`,
      undefined,
      {
        sendPush: true,
        sendEmail: true,
        sendTelegram: true,
        pushTitle: "Документы отправлены на проверку",
        emailSubject: "Документы отправлены на проверку",
      }
    );
  },
};

