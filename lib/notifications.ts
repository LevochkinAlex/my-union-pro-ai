/**
 * Универсальная система уведомлений (push + email)
 * Не привязана к чатам/ботам
 */

import { messaging } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "./email";

export interface NotificationOptions {
  title: string;
  message: string;
  userId?: string; // Если указан, отправляется конкретному пользователю
  userIds?: string[]; // Если указан, отправляется нескольким пользователям
  sendToAll?: boolean; // Если true, отправляется всем пользователям
  data?: Record<string, any>; // Дополнительные данные для push
  link?: string; // Ссылка для перехода из уведомления
  emailHtml?: string; // Кастомный HTML для email (если не указан, используется стандартный шаблон)
}

/**
 * Отправка push-уведомления через FCM
 */
async function sendPushNotification(
  fcmTokens: string[],
  options: NotificationOptions
): Promise<{ successCount: number; failureCount: number }> {
  if (fcmTokens.length === 0) {
    return { successCount: 0, failureCount: 0 };
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    const link = options.link || baseUrl;

    const message = {
      notification: {
        title: options.title,
        body: options.message,
      },
      webpush: {
        notification: {
          title: options.title,
          body: options.message,
          icon: `${baseUrl}/icon.png`,
          badge: `${baseUrl}/icon.png`,
          sound: `${baseUrl}/notification-sound.mp3`,
        },
        fcmOptions: {
          link,
        },
        ...(options.data && {
          data: {
            ...options.data,
            link, // Добавляем ссылку в data для клиентской обработки
          },
        }),
      },
      android: {
        priority: "high" as const,
        notification: {
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
      ...(options.data && { data: options.data }),
      tokens: fcmTokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    console.log("[notifications] Push sent:", {
      successCount: response.successCount,
      failureCount: response.failureCount,
      title: options.title,
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error("[notifications] Push error:", error);
    return { successCount: 0, failureCount: fcmTokens.length };
  }
}

/**
 * Отправка email-уведомления
 */
async function sendEmailNotification(
  email: string,
  options: NotificationOptions
): Promise<boolean> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    const link = options.link || baseUrl;

    const htmlContent =
      options.emailHtml ||
      `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
        ${options.title}
      </h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
        ${options.message.replace(/\n/g, "<br>")}
      </p>
      
      ${link ? `
      <!-- Button -->
      <div style="text-align: center; margin: 40px 0;">
        <a href="${link}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
          Открыть
        </a>
      </div>
      ` : ""}
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
      <p style="margin: 0 0 10px; font-size: 14px; color: #666666;">
        <strong>МойСоюз</strong> — современная платформа для профсоюзов
      </p>
      <p style="margin: 0; font-size: 12px; color: #999999;">
        Техподдержка: <a href="mailto:support@myunion.pro" style="color: #667eea; text-decoration: none;">support@myunion.pro</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    await sendEmail({
      to: email,
      subject: options.title,
      html: htmlContent,
      text: options.message,
    });

    console.log("[notifications] Email sent to:", email);
    return true;
  } catch (error) {
    console.error("[notifications] Email error:", error);
    return false;
  }
}

/**
 * Универсальная функция отправки уведомлений (push + email)
 */
export async function sendNotification(
  options: NotificationOptions
): Promise<{
  push: { successCount: number; failureCount: number };
  email: { sent: number; failed: number };
}> {
  // Определяем список пользователей для отправки
  let userIds: string[] = [];

  if (options.userId) {
    userIds = [options.userId];
  } else if (options.userIds && options.userIds.length > 0) {
    userIds = options.userIds;
  } else if (options.sendToAll) {
    // Получаем всех активных пользователей
    const users = await prisma.user.findMany({
      where: {
        email: { not: null },
      },
      select: { id: true },
    });
    userIds = users.map((u) => u.id);
  } else {
    console.warn("[notifications] No recipients specified");
    return {
      push: { successCount: 0, failureCount: 0 },
      email: { sent: 0, failed: 0 },
    };
  }

  // Получаем FCM токены и email адреса
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
    include: {
      pushSubscriptions: {
        where: {
          fcmToken: { not: null },
        },
        select: { fcmToken: true },
        distinct: ["fcmToken"],
      },
    },
  });

  console.log("[notifications] Found users for notification:", {
    userIds,
    usersCount: users.length,
    subscriptionsCount: users.reduce((sum, u) => sum + u.pushSubscriptions.length, 0),
  });

  // Собираем FCM токены
  const fcmTokens: string[] = [];
  users.forEach((user) => {
    user.pushSubscriptions.forEach((sub) => {
      if (sub.fcmToken) {
        fcmTokens.push(sub.fcmToken);
      }
    });
  });

  console.log("[notifications] FCM tokens collected:", {
    tokensCount: fcmTokens.length,
    tokensPreview: fcmTokens.slice(0, 2).map(t => t.substring(0, 20) + "..."),
  });

  // Отправляем push-уведомления
  const pushResult = await sendPushNotification(fcmTokens, options);
  
  console.log("[notifications] Push notification result:", {
    successCount: pushResult.successCount,
    failureCount: pushResult.failureCount,
    title: options.title,
  });

  // Отправляем email-уведомления
  let emailSent = 0;
  let emailFailed = 0;

  for (const user of users) {
    if (user.email) {
      const success = await sendEmailNotification(user.email, options);
      if (success) {
        emailSent++;
      } else {
        emailFailed++;
      }
    }
  }

  return {
    push: pushResult,
    email: { sent: emailSent, failed: emailFailed },
  };
}

