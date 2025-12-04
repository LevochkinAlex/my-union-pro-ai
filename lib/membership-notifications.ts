import { prisma } from "./prisma";
import { sendEmail } from "./email";

/**
 * Отправляет уведомления пользователю при изменении статуса членства
 */
export async function sendMembershipStatusNotification(
  userId: string,
  status: "APPROVED" | "REJECTED",
  comment?: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      pushNotificationsEnabled: true,
      emailAppealNotifications: true,
      pushSubscriptions: {
        select: {
          oneSignalId: true,
          fcmToken: true,
        },
      },
    },
  });

  if (!user) {
    console.warn("[membership-notifications] Пользователь не найден:", userId);
    return;
  }

  const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Пользователь";
  
  // Текст уведомления
  const title = status === "APPROVED" 
    ? "🎉 Поздравляем! Вы приняты в профсоюз"
    : "❌ Заявление отклонено";
  
  const message = status === "APPROVED"
    ? `Добро пожаловать в профсоюз! Ваше заявление было одобрено. Теперь вы полноправный член профсоюза.`
    : `Ваше заявление о вступлении в профсоюз было отклонено.${comment ? ` Причина: ${comment}` : ""}`;

  // Отправляем push уведомления
  if (user.pushNotificationsEnabled && user.pushSubscriptions.length > 0) {
    try {
      // Используем OneSignal если есть oneSignalId
      const oneSignalIds = user.pushSubscriptions
        .map(sub => sub.oneSignalId)
        .filter(Boolean) as string[];

      if (oneSignalIds.length > 0 && process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_API_KEY) {
        const response = await fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${process.env.ONESIGNAL_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: process.env.ONESIGNAL_APP_ID,
            include_player_ids: oneSignalIds,
            headings: { en: title, ru: title },
            contents: { en: message, ru: message },
            data: {
              type: "membership_status_change",
              status: status,
              userId: userId,
            },
          }),
        });

        if (!response.ok) {
          console.error("[membership-notifications] Ошибка отправки OneSignal:", await response.text());
        } else {
          console.log("[membership-notifications] Push уведомление отправлено через OneSignal");
        }
      }

      // Также отправляем через FCM если есть fcmToken
      const fcmTokens = user.pushSubscriptions
        .map(sub => sub.fcmToken)
        .filter(Boolean) as string[];

      if (fcmTokens.length > 0) {
        try {
          const { messaging } = await import("./firebase-admin");
          const fcmMessage = {
            notification: {
              title: title,
              body: message,
            },
            data: {
              type: "membership_status_change",
              status: status,
              userId: userId,
            },
            tokens: fcmTokens,
          };

          const response = await messaging.sendEachForMulticast(fcmMessage);
          console.log("[membership-notifications] FCM уведомления отправлены:", {
            successCount: response.successCount,
            failureCount: response.failureCount,
          });
        } catch (fcmError) {
          console.error("[membership-notifications] Ошибка отправки FCM:", fcmError);
        }
      }
    } catch (pushError) {
      console.error("[membership-notifications] Ошибка отправки push уведомлений:", pushError);
    }
  }

  // Отправляем email уведомление
  if (user.email && user.emailAppealNotifications) {
    try {
      const emailSubject = status === "APPROVED"
        ? "Поздравляем! Вы приняты в профсоюз"
        : "Заявление о вступлении в профсоюз отклонено";

      const emailBody = status === "APPROVED"
        ? `
          <h2>Поздравляем, ${userName}!</h2>
          <p>Ваше заявление о вступлении в профсоюз было одобрено.</p>
          <p>Теперь вы полноправный член профсоюза. Добро пожаловать!</p>
          <p>Вы можете войти в личный кабинет и ознакомиться с доступными возможностями.</p>
        `
        : `
          <h2>Уважаемый(ая) ${userName}!</h2>
          <p>К сожалению, ваше заявление о вступлении в профсоюз было отклонено.</p>
          ${comment ? `<p><strong>Причина:</strong> ${comment}</p>` : ""}
          <p>Если у вас есть вопросы, пожалуйста, свяжитесь с администрацией профсоюза.</p>
        `;

      // Создаем текстовую версию письма (убираем HTML теги)
      const textBody = emailBody
        .replace(/<[^>]*>/g, '') // Убираем HTML теги
        .replace(/\s+/g, ' ') // Убираем лишние пробелы
        .trim();

      await sendEmail({
        to: user.email,
        subject: emailSubject,
        html: emailBody,
        text: textBody,
      });

      console.log("[membership-notifications] Email уведомление отправлено:", user.email);
    } catch (emailError) {
      console.error("[membership-notifications] Ошибка отправки email:", emailError);
    }
  }
}

