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
        const emailSubject = options?.emailSubject || "Уведомление от МойСоюз";
        const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${emailSubject}</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${content.replace(/\n/g, "<br>")}
            </div>
            <p style="color: #666; font-size: 14px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/dashboard?session=${session.id}" 
                 style="color: #0066cc; text-decoration: none;">
                Открыть в МойСоюз →
              </a>
            </p>
          </div>`;
        const emailText = content.replace(/<[^>]*>/g, "");
        
        await sendEmail({
          to: user.email,
          subject: emailSubject,
          html: emailHtml,
          text: emailText,
        });
      } catch (error) {
        console.error("[system-messages] Email error:", error);
      }
    }

    // Отправляем в Telegram
    if (options?.sendTelegram && user?.telegramChatId) {
      try {
        // Обрабатываем маркеры для Telegram кнопок
        let telegramText = content.replace(/<[^>]*>/g, ""); // Убираем HTML
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
        let inlineButtons: { text: string; url: string }[][] | undefined;
        
        // Проверяем наличие маркера [GENERATE_DOCUMENTS_BUTTON]
        if (telegramText.includes("[GENERATE_DOCUMENTS_BUTTON]")) {
          telegramText = telegramText.replace(/\[GENERATE_DOCUMENTS_BUTTON\]/g, "");
          const dashboardUrl = `${appUrl}/dashboard?session=${session.id}`;
          inlineButtons = [[{ text: "📝 Сгенерировать документы", url: dashboardUrl }]];
        }
        
        // Проверяем наличие маркера [SHOW_DOCUMENTS_BUTTONS]
        if (telegramText.includes("[SHOW_DOCUMENTS_BUTTONS]")) {
          telegramText = telegramText.replace(/\[SHOW_DOCUMENTS_BUTTONS\]/g, "");
          const documentsUrl = `${appUrl}/dashboard/documents`;
          inlineButtons = [[{ text: "📄 Открыть документы", url: documentsUrl }]];
        }
        
        await sendTelegramMessage(
          user.telegramChatId,
          `<b>${options?.pushTitle || "МойСоюз"}</b>\n\n${telegramText.trim()}`,
          inlineButtons
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
    // Проверяем, не отправляли ли уже это сообщение
    const existingMessage = await prisma.chatMessage.findFirst({
      where: {
        userId,
        content: { contains: "Вы успешно заполнили свою анкету" },
        isSystemMessage: true,
      },
    });

    if (existingMessage) {
      console.log("[system-messages] Profile completed message already exists, skipping");
      return existingMessage;
    }

    return sendSystemMessage(
      userId,
      `Вы успешно заполнили свою анкету!\n\nТеперь вы можете сгенерировать документы для вступления в профсоюз.\n\n[GENERATE_DOCUMENTS_BUTTON]`,
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
    // Проверяем, не отправляли ли уже это сообщение
    const existingMessage = await prisma.chatMessage.findFirst({
      where: {
        userId,
        content: { contains: "Отлично! Ваши документы сгенерированы" },
        isSystemMessage: true,
      },
    });

    if (existingMessage) {
      console.log("[system-messages] Documents generated message already exists, skipping");
      return existingMessage;
    }

    return sendSystemMessage(
      userId,
      `Отлично! Ваши документы сгенерированы.\n\nПожалуйста, скачайте их, подпишите и загрузите обратно в систему. После этого AI-помощник будет готов ответить на все ваши вопросы.\n\n[SHOW_DOCUMENTS_BUTTONS]`,
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
   * Документы уже были сгенерированы - показываем кнопки скачивания и поле загрузки
   */
  async documentsAlreadyGenerated(userId: string, documents: Array<{ id: string; type: string; title: string | null; filePath: string | null }>) {
    // Проверяем, не отправляли ли уже это сообщение
    const existingMessage = await prisma.chatMessage.findFirst({
      where: {
        userId,
        content: { contains: "[SHOW_DOCUMENT_DOWNLOADS]" },
        isSystemMessage: true,
      },
    });

    if (existingMessage) {
      console.log("[system-messages] Documents already generated message already exists, skipping");
      return existingMessage;
    }

    const docsList = documents
      .map((doc) => {
        const title = doc.title || (doc.type === "MEMBERSHIP_APPLICATION" ? "Заявление о вступлении в профсоюз" : "Заявление о взносах");
        return `• ${title}`;
      })
      .join("\n");

    return sendSystemMessage(
      userId,
      `Документы уже были сгенерированы:\n\n${docsList}\n\nПожалуйста, скачайте их (кнопки ниже), подпишите и загрузите обратно (поле для загрузки ниже).\n\n[SHOW_DOCUMENT_DOWNLOADS]\n[SHOW_DOCUMENT_UPLOAD]`,
      undefined,
      {
        sendPush: false, // Не спамить при повторном нажатии
        sendEmail: false,
        sendTelegram: false,
      }
    );
  },

  /**
   * Инструкция по загрузке документов
   */
  async uploadDocumentsInstruction(userId: string) {
    // Проверяем, не отправляли ли уже это сообщение
    const existingMessage = await prisma.chatMessage.findFirst({
      where: {
        userId,
        content: { contains: "Вы можете прикрепить подписанные документы" },
        isSystemMessage: true,
      },
    });

    if (existingMessage) {
      console.log("[system-messages] Upload instruction message already exists, skipping");
      return existingMessage;
    }

    return sendSystemMessage(
      userId,
      `Вы можете прикрепить подписанные документы прямо в чат (используйте кнопку прикрепления файла) или воспользоваться разделом "Документы" в меню.`,
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
    // Проверяем, не отправляли ли уже это сообщение
    const existingMessage = await prisma.chatMessage.findFirst({
      where: {
        userId,
        content: { contains: "Превосходно! 🎉 Ваши документы получены" },
        isSystemMessage: true,
      },
    });

    if (existingMessage) {
      console.log("[system-messages] Documents submitted message already exists, skipping");
      return existingMessage;
    }

    return sendSystemMessage(
      userId,
      `Превосходно! 🎉 Ваши документы получены и отправлены на проверку.\n\n**Что происходит дальше?**\n\n⏳ Проверка ваших заявлений обычно занимает **1-2 рабочих дня**. Мы уведомим вас, когда документы будут одобрены.\n\nА пока что давайте расскажу, какие **возможности** открываются для вас как члена профсоюза! 😊\n\n---\n\n## 🎁 Эксклюзивные скидки BestBenefits\n\nВы получаете **бесплатный доступ** к платформе скидок:\n\n- 🍽️ **Рестораны и кафе** - скидки 10-30%\n- 🛍️ **Магазины** - специальные предложения\n- 🎬 **Развлечения** - кино, театры, концерты\n- 💆 **Красота и здоровье** - салоны, фитнес-клубы\n- 🏥 **Медицинские услуги** - консультации, обследования\n\n## 📚 Юридическая поддержка\n\n- Консультации по трудовому праву\n- Помощь в решении трудовых споров\n- Защита ваших прав на рабочем месте\n\n## 🎁 Социальные программы\n\n- Помощь в сложных жизненных ситуациях\n- Материальная поддержка\n- Организация досуга и мероприятий\n\n## 📢 Участие в жизни профсоюза\n\n- Голосование по важным вопросам\n- Участие в собраниях\n- Реализация ваших инициатив\n\n## 🏥 Медицинская поддержка\n\n- Программы оздоровления\n- Профилактические мероприятия\n- Медицинские осмотры\n\n## 🎓 Образовательные программы\n\n- Курсы повышения квалификации\n- Семинары и тренинги\n- Профессиональное развитие\n\n---\n\nПосле одобрения вы сможете общаться с AI-помощником и задавать любые вопросы!`,
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

