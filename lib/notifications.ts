import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { messaging } from "@/lib/firebase-admin";

export type NotificationType = 
  | "post_comment" // Комментарий к посту
  | "comment_reply" // Ответ на комментарий
  | "chat_message" // Новое сообщение в чате
  | "user_post" // Новый пост пользователя
  | "documents_ready" // Документы готовы
  | "ticket_response" // Ответ на обращение
  | "ticket_rated" // Оценка обращения
  | "document_regeneration_required" // Требуется перегенерация документов
  | "news_published" // Опубликована новость
  | "mass_notification" // Массовое уведомление
  | "staff_added" // Назначен сотрудником
  | "report_status_changed"; // Изменён статус отчёта

interface NotificationData {
  userId: string; // Кому отправить
  type: NotificationType;
  title: string;
  body: string;
  url: string; // URL для перехода при клике
  senderName?: string; // Имя отправителя
}

/**
 * Отправляет уведомление пользователю с учетом его настроек
 */
export async function sendUserNotification(data: NotificationData) {
  try {
    // Проверяем, что userId не null/undefined
    if (!data.userId || typeof data.userId !== 'string' || data.userId.trim() === '') {
      console.error(`[notifications] Invalid userId: ${data.userId}`);
      return { push: false, email: false };
    }

    // Получаем настройки пользователя
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      include: {
        pushSubscriptions: {
          select: {
            fcmToken: true,
          },
        },
      },
    });

    if (!user) {
      console.error(`[notifications] User ${data.userId} not found`);
      return { push: false, email: false };
    }

    const results = {
      push: false,
      email: false,
    };

    // Сохраняем уведомление в БД
    let notificationRecord = null;
    try {
      notificationRecord = await prisma.userNotification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          body: data.body,
          url: data.url,
          metadata: {
            senderName: data.senderName,
          },
          pushSent: false,
          emailSent: false,
        },
      });
    } catch (error) {
      console.error("[notifications] Error saving notification to DB:", error);
      // Продолжаем отправку даже если не удалось сохранить в БД
    }

    // Отправляем Push уведомление
    if (user.pushNotificationsEnabled && user.pushSubscriptions.length > 0) {
      try {
        await Promise.all(
          user.pushSubscriptions.map(async (sub) => {
            try {
              if (!sub.fcmToken) return { success: false };
              await messaging.send({
                token: sub.fcmToken,
                notification: {
                  title: data.title,
                  body: data.body,
                },
                data: {
                  url: data.url,
                  type: data.type,
                  notificationId: notificationRecord?.id || "",
                },
                webpush: {
                  notification: {
                    icon: "/icons/icon-192x192.png",
                    badge: "/icons/badge-72x72.png",
                    sound: user.pushSoundEnabled ? "default" : undefined,
                    requireInteraction: true,
                    tag: data.type,
                    data: {
                      url: data.url,
                    },
                  },
                },
              });
              results.push = true;
            } catch (error) {
              console.error(`[notifications] Failed to send push to token ${sub.fcmToken}:`, error);
            }
          })
        );
        
        // Обновляем статус отправки push
        if (notificationRecord && results.push) {
          await prisma.userNotification.update({
            where: { id: notificationRecord.id },
            data: { pushSent: true },
          });
        }
      } catch (error) {
        console.error("[notifications] Error sending push notifications:", error);
      }
    }

    // Отправляем Email уведомление
    const shouldSendEmail = getShouldSendEmail(data.type, user);
    
    if (shouldSendEmail && user.email) {
      try {
        const emailSubject = getEmailSubject(data.type, data.senderName);
        const emailBody = getEmailBody(data.type, data.senderName, data.body, data.url, user.firstName);

        await sendEmail({
          to: user.email,
          subject: emailSubject,
          text: emailBody,
          html: getEmailHtml(data.type, data.senderName, data.body, data.url, user.firstName),
        });
        results.email = true;
        
        // Обновляем статус отправки email
        if (notificationRecord) {
          await prisma.userNotification.update({
            where: { id: notificationRecord.id },
            data: { emailSent: true },
          });
        }
      } catch (error) {
        console.error("[notifications] Error sending email:", error);
      }
    }

    console.log(`[notifications] Sent notifications to ${data.userId}:`, results);
    return results;
  } catch (error) {
    console.error("[notifications] Error sending notification:", error);
    throw error;
  }
}

/**
 * Определяет, нужно ли отправлять email для данного типа уведомления
 */
function getShouldSendEmail(
  type: NotificationType,
  user: {
    emailBotNotifications: boolean;
    emailAppealNotifications: boolean;
  }
): boolean {
  switch (type) {
    case "post_comment":
    case "comment_reply":
      // Используем настройку emailAppealNotifications для комментариев
      return user.emailAppealNotifications;
    case "chat_message":
      // Используем настройку emailBotNotifications для чата
      return user.emailBotNotifications;
    case "documents_ready":
    case "ticket_response":
    case "document_regeneration_required":
    case "news_published":
    case "mass_notification":
      // Важные уведомления используют настройку emailAppealNotifications
      return user.emailAppealNotifications;
    case "user_post":
      // Уведомления о новых постах также используют emailAppealNotifications
      return user.emailAppealNotifications;
    default:
      // Для неизвестных типов не отправляем email
      return false;
  }
}

/**
 * Генерирует тему письма
 */
function getEmailSubject(type: NotificationType, senderName?: string): string {
  switch (type) {
    case "post_comment":
      return `Новый комментарий к вашему посту от ${senderName || "пользователя"}`;
    case "comment_reply":
      return `${senderName || "Пользователь"} ответил на ваш комментарий`;
    case "chat_message":
      return `Новое сообщение от ${senderName || "пользователя"}`;
    case "user_post":
      return `Новый пост от ${senderName || "пользователя"}`;
    case "documents_ready":
      return "Документы готовы для подписания";
    case "ticket_response":
      return "Получен ответ на ваше обращение";
    case "document_regeneration_required":
      return "Требуется перегенерация документов";
    case "news_published":
      return "Опубликована новая новость";
    case "mass_notification":
      return "Важное уведомление";
    default:
      return "Новое уведомление";
  }
}

/**
 * Генерирует текстовое тело письма
 */
function getEmailBody(
  type: NotificationType,
  senderName: string | undefined,
  body: string,
  url: string,
  userName?: string
): string {
  const greeting = userName ? `Здравствуйте, ${userName}!` : "Здравствуйте!";
  
  let message = "";
  switch (type) {
    case "post_comment":
      message = `${senderName || "Пользователь"} оставил комментарий к вашему посту:\n\n"${body}"\n\n`;
      break;
    case "comment_reply":
      message = `${senderName || "Пользователь"} ответил на ваш комментарий:\n\n"${body}"\n\n`;
      break;
    case "chat_message":
      message = `${senderName || "Пользователь"} отправил вам сообщение:\n\n"${body}"\n\n`;
      break;
    case "user_post":
      message = `${senderName || "Пользователь"} опубликовал новый пост:\n\n"${body}"\n\n`;
      break;
    case "documents_ready":
      message = `${body}\n\n`;
      break;
    case "ticket_response":
      message = `${body}\n\n`;
      break;
    case "document_regeneration_required":
      message = `${body}\n\n`;
      break;
    case "news_published":
      message = `${body}\n\n`;
      break;
    case "mass_notification":
      message = `${body}\n\n`;
      break;
    default:
      message = `${body}\n\n`;
  }

  return `${greeting}\n\n${message}Чтобы прочитать и ответить, перейдите по ссылке:\n${url}\n\n--\nС уважением,\nКоманда MyUnion`;
}

/**
 * Генерирует HTML тело письма
 */
function getEmailHtml(
  type: NotificationType,
  senderName: string | undefined,
  body: string,
  url: string,
  userName?: string
): string {
  const greeting = userName ? `Здравствуйте, ${userName}!` : "Здравствуйте!";
  
  let message = "";
  let actionText = "Перейти";
  
  switch (type) {
    case "post_comment":
      message = `<strong>${senderName || "Пользователь"}</strong> оставил комментарий к вашему посту:`;
      actionText = "Посмотреть комментарий";
      break;
    case "comment_reply":
      message = `<strong>${senderName || "Пользователь"}</strong> ответил на ваш комментарий:`;
      actionText = "Посмотреть ответ";
      break;
    case "chat_message":
      message = `<strong>${senderName || "Пользователь"}</strong> отправил вам сообщение:`;
      actionText = "Открыть чат";
      break;
    case "user_post":
      message = `<strong>${senderName || "Пользователь"}</strong> опубликовал новый пост:`;
      actionText = "Посмотреть пост";
      break;
    case "documents_ready":
      message = body;
      actionText = "Открыть документы";
      break;
    case "ticket_response":
      message = body;
      actionText = "Открыть обращение";
      break;
    case "document_regeneration_required":
      message = body;
      actionText = "Открыть профиль пользователя";
      break;
    case "news_published":
      message = body;
      actionText = "Читать новость";
      break;
    case "mass_notification":
      message = body;
      actionText = "Открыть уведомление";
      break;
    default:
      message = body;
      actionText = "Перейти";
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .message-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MyUnion</h1>
    </div>
    <div class="content">
      <p>${greeting}</p>
      <p>${message}</p>
      <div class="message-box">
        <p style="margin: 0; color: #374151;">${body}</p>
      </div>
      <a href="${url}" class="button">${actionText}</a>
      <div class="footer">
        <p>С уважением,<br>Команда MyUnion</p>
        <p style="font-size: 12px; color: #9ca3af;">Если вы не хотите получать такие уведомления, вы можете изменить настройки в вашем профиле.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Отправляет массовое уведомление всем пользователям (для новостей, объявлений и т.д.)
 * Используется супер-админом для рассылки важных сообщений
 */
export async function sendMassNotification(data: {
  sendToAll?: boolean;
  userIds?: string[]; // Если указано, отправляет только этим пользователям
  title: string;
  body: string;
  url: string;
  type?: string;
}): Promise<{
  push: boolean;
  email: boolean;
}> {
  try {
    let pushSent = false;
    let emailSent = false;

    // Получаем список пользователей для рассылки
    let users;
    if (data.sendToAll) {
      users = await prisma.user.findMany({
        where: {
          emailVerified: { not: null }, // Только верифицированные
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          pushNotificationsEnabled: true,
          pushSoundEnabled: true,
          emailBotNotifications: true,
          emailAppealNotifications: true,
          pushSubscriptions: {
            select: {
              fcmToken: true,
            },
          },
        },
      });
    } else if (data.userIds && data.userIds.length > 0) {
      users = await prisma.user.findMany({
        where: {
          id: { in: data.userIds },
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          pushNotificationsEnabled: true,
          pushSoundEnabled: true,
          emailBotNotifications: true,
          emailAppealNotifications: true,
          pushSubscriptions: {
            select: {
              fcmToken: true,
            },
          },
        },
      });
    } else {
      console.log("[notifications] No users specified for mass notification");
      return { push: false, email: false };
    }

    console.log(`[notifications] Sending mass notification to ${users.length} users`);

    // Отправляем уведомления параллельно всем пользователям
    const results = await Promise.all(
      users.map(async (user) => {
        const userResult = { push: false, email: false };
        try {
          // Push уведомления
          if (user.pushNotificationsEnabled && user.pushSubscriptions.length > 0) {
            const pushResults = await Promise.allSettled(
              user.pushSubscriptions.map(async (sub) => {
                try {
                  if (!sub.fcmToken) return { success: false };
                  await messaging.send({
                    token: sub.fcmToken,
                    notification: {
                      title: data.title,
                      body: data.body,
                    },
                    data: {
                      url: data.url,
                      type: data.type || "mass_notification",
                    },
                    webpush: {
                      notification: {
                        icon: "/icons/icon-192x192.png",
                        badge: "/icons/badge-72x72.png",
                        sound: user.pushSoundEnabled ? "default" : undefined,
                        requireInteraction: true,
                        data: {
                          url: data.url,
                        },
                      },
                    },
                  });
                  return { success: true };
                } catch (error) {
                  console.error(`[notifications] Push failed for ${sub.fcmToken}:`, error);
                  return { success: false };
                }
              })
            );

            pushResults.forEach((r) => {
              if (r.status === "fulfilled" && r.value.success) {
                userResult.push = true;
              }
            });
          }

          // Email уведомления (для важных объявлений используем emailAppealNotifications)
          if (user.emailAppealNotifications && user.email) {
            try {
              await sendEmail({
                to: user.email,
                subject: data.title,
                text: `${data.body}\n\nПерейти: ${data.url}`,
                html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .message { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea; }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MyUnion</h1>
    </div>
    <div class="content">
      <p>Здравствуйте, ${user.firstName || ""}!</p>
      <div class="message">
        <p>${data.body}</p>
      </div>
      <a href="${data.url}" class="button">Перейти</a>
      <div class="footer">
        <p>С уважением,<br>Команда MyUnion</p>
      </div>
    </div>
  </div>
</body>
</html>
                `,
              });
              userResult.email = true;
            } catch (error) {
              console.error(`[notifications] Email failed for ${user.email}:`, error);
            }
          }
        } catch (error) {
          console.error(`[notifications] Error sending to user ${user.id}:`, error);
        }
        return userResult;
      })
    );

    // Определяем, были ли отправлены хотя бы одно push или email уведомление
    pushSent = results.some(r => r.push);
    emailSent = results.some(r => r.email);

    console.log("[notifications] Mass notification complete:", { push: pushSent, email: emailSent });
    return { push: pushSent, email: emailSent };
  } catch (error) {
    console.error("[notifications] Error in sendMassNotification:", error);
    throw error;
  }
}

// Экспортируем sendMassNotification как sendNotification для обратной совместимости
export { sendMassNotification as sendNotification };
