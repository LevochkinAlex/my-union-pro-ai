/**
 * Email функции для отправки magic links и уведомлений
 */

import nodemailer from "nodemailer";
import { getSupportEmail } from "@/lib/support-user";

export interface SendEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Создание транспорта для отправки email
 */
function createEmailTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.mail.ru",
    port: parseInt(process.env.SMTP_PORT || "465"),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

/**
 * Проверяет, включен ли режим разработки
 */
function isDevMode(): boolean {
  return process.env.NODE_ENV === "development" || process.env.DEV_EMAIL_MODE === "true";
}

/**
 * Проверяет, настроен ли SMTP
 */
function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export type SendEmailDispatchResult = { sent: boolean };

/**
 * Универсальная функция для отправки email.
 * Реальная отправка через SMTP, если заданы SMTP_HOST, SMTP_USER и SMTP_PASSWORD
 * (в том числе на localhost — чтобы можно было проверять интеграцию).
 * Если SMTP не настроен — только лог в консоль, возвращает { sent: false }.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailDispatchResult> {
  console.log("[Email] Готово к отправке:");
  console.log("  To:", options.to);
  console.log("  Subject:", options.subject);

  if (!isSmtpConfigured()) {
    console.log("\n" + "=".repeat(60));
    console.log("📧 [Email] SMTP не настроен — письмо не отправлено по сети");
    console.log("   Задайте SMTP_HOST, SMTP_USER, SMTP_PASSWORD в .env / .env.local");
    console.log("=".repeat(60));
    console.log("  To:", options.to);
    console.log("  Subject:", options.subject);
    console.log("  Text:", options.text?.substring(0, 200) + "...");
    console.log("=".repeat(60) + "\n");
    return { sent: false };
  }

  try {
    const transporter = createEmailTransport();

    await transporter.verify();
    console.log("[Email] ✅ SMTP сервер готов");

    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"МойСоюз" <${process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "high",
      },
    });

    console.log("[Email] ✅ Email отправлен:", {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
    });

    if (result.rejected && result.rejected.length > 0) {
      throw new Error(`Email отклонен: ${result.rejected.join(", ")}`);
    }
    return { sent: true };
  } catch (error) {
    console.error("[Email] Ошибка отправки:", error);
    throw error;
  }
}

/**
 * Отправляет Magic Link на email для авторизации
 * В режиме разработки выводит ссылку в консоль вместо отправки
 */
export async function sendMagicLinkEmail(
  email: string,
  magicLink: string,
  isNewUser: boolean,
  firstName?: string
): Promise<SendEmailResult & { devMode?: boolean; magicLink?: string }> {
  const name = firstName ? `, ${firstName}` : "";
  const subject = isNewUser ? "Добро пожаловать в МойСоюз!" : "Вход в МойСоюз";
  
  // В режиме разработки или если SMTP не настроен - выводим ссылку в консоль
  if (isDevMode() || !isSmtpConfigured()) {
    console.log("\n" + "🔗".repeat(30));
    console.log("🚀 [DEV MODE] MAGIC LINK ДЛЯ АВТОРИЗАЦИИ:");
    console.log("🔗".repeat(30));
    console.log("📧 Email:", email);
    console.log("👤 New User:", isNewUser);
    console.log("🔐 Magic Link:");
    console.log("\n  👉 " + magicLink + "\n");
    console.log("🔗".repeat(30) + "\n");
    
    return {
      success: true,
      messageId: "dev-mode-" + Date.now(),
      devMode: true,
      magicLink: magicLink, // Возвращаем ссылку для показа на фронте
    };
  }

  try {
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
        ${isNewUser ? "👋 Добро пожаловать!" : "🎉 С возвращением!"}
      </h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
        Привет${name}!
      </p>
      
      <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #333333;">
        ${isNewUser 
          ? "Мы рады видеть вас в МойСоюз! Нажмите кнопку ниже, чтобы завершить регистрацию и настроить свой профиль." 
          : "Нажмите кнопку ниже, чтобы войти в свой личный кабинет."}
      </p>
      
      <!-- Button -->
      <div style="text-align: center; margin: 40px 0;">
        <a href="${magicLink}" 
           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
          ${isNewUser ? "🚀 Завершить регистрацию" : "🔐 Войти в аккаунт"}
        </a>
      </div>
      
      <p style="margin: 30px 0 10px; font-size: 14px; color: #666666;">
        Или скопируйте эту ссылку в браузер:
      </p>
      <div style="padding: 12px; background-color: #f5f5f5; border-radius: 6px; word-break: break-all;">
        <a href="${magicLink}" style="color: #667eea; text-decoration: none; font-size: 13px;">
          ${magicLink}
        </a>
      </div>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; font-size: 13px; color: #999999; line-height: 1.6;">
          ⏱ Эта ссылка действительна <strong>15 минут</strong><br>
          ⚠️ Если вы не запрашивали это письмо, просто проигнорируйте его
        </p>
      </div>
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
    `.trim();

    console.log("[Email] Готово к отправке:");
    console.log("  To:", email);
    console.log("  Subject:", subject);
    console.log("  Magic Link:", magicLink);
    console.log("  Is New User:", isNewUser);

    // Отправляем через SMTP
    await sendEmail({
      to: email,
      subject,
      html: htmlContent,
      text: `Привет${name}!\n\n${isNewUser ? "Мы рады видеть вас в МойСоюз! Перейдите по ссылке ниже, чтобы завершить регистрацию." : "Перейдите по ссылке ниже, чтобы войти в свой личный кабинет."}\n\n${magicLink}\n\nЭта ссылка действительна 15 минут.`,
    });

    return {
      success: true,
      messageId: "sent-" + Date.now(),
    };
  } catch (error) {
    console.error("[Email] Ошибка отправки:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Письмо со ссылкой подтверждения полной регистрации (до создания аккаунта в БД) */
export async function sendRegistrationConfirmationEmail(
  email: string,
  confirmLink: string,
  opts: { firstName: string },
): Promise<SendEmailResult & { devMode?: boolean; magicLink?: string }> {
  const subject = "Подтвердите регистрацию в МойСоюз";
  const greeting = opts.firstName ? `Здравствуйте, ${opts.firstName}!` : "Здравствуйте!";

  if (isDevMode() || !isSmtpConfigured()) {
    console.log("\n" + "🔗".repeat(30));
    console.log("📧 [REGISTRATION] Подтверждение регистрации");
    console.log("📧 Email:", email);
    console.log("👉", confirmLink);
    console.log("🔗".repeat(30) + "\n");
    return {
      success: true,
      messageId: "dev-reg-" + Date.now(),
      devMode: true,
      magicLink: confirmLink,
    };
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#0a5db5 0%,#5b21b6 100%);padding:32px 20px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:600;">Подтверждение регистрации</h1>
    </div>
    <div style="padding:32px 28px;">
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#333;">${greeting}</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#333;">
        Нажмите кнопку ниже, чтобы подтвердить email и войти в личный кабинет. Пароль не требуется — дальнейшие входы по одноразовой ссылке на почту.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${confirmLink}" style="display:inline-block;padding:14px 36px;background:#0a5db5;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
          Подтвердить и войти
        </a>
      </div>
      <p style="margin:16px 0 8px;font-size:13px;color:#666;">Или скопируйте ссылку:</p>
      <div style="padding:12px;background:#f5f5f5;border-radius:6px;word-break:break-all;font-size:13px;">
        <a href="${confirmLink}" style="color:#0a5db5;">${confirmLink}</a>
      </div>
      <p style="margin-top:24px;font-size:13px;color:#999;line-height:1.5;">
        Ссылка действительна <strong>24 часа</strong>. Если вы не оставляли заявку, проигнорируйте письмо.
      </p>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    await sendEmail({
      to: email,
      subject,
      html: htmlContent,
      text: `${greeting}\n\nПодтвердите регистрацию по ссылке (действительна 24 часа):\n${confirmLink}`,
    });
    return { success: true, messageId: "sent-reg-" + Date.now() };
  } catch (error) {
    console.error("[Email] registration confirm:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Отправляет код верификации на email (для старой системы регистрации)
 */
export async function sendVerificationEmail(
  email: string,
  verificationToken: string
): Promise<{ sent: boolean; error?: string }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    const verificationLink = `${baseUrl}/register/verify?token=${verificationToken}`;
    
    const subject = "Подтверждение email для регистрации в МойСоюз";
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Подтверждение email</h1>
    </div>
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
        Для завершения регистрации подтвердите ваш email адрес.
      </p>
      <div style="text-align: center; margin: 40px 0;">
        <a href="${verificationLink}" 
           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
          Подтвердить email
        </a>
      </div>
      <p style="margin: 30px 0 10px; font-size: 14px; color: #666666;">
        Или скопируйте ссылку: ${verificationLink}
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    console.log("[Email] Verification email готов к отправке:", email);
    
    // Отправляем через SMTP
    try {
      await sendEmail({
        to: email,
        subject,
        html: htmlContent,
        text: `Для завершения регистрации подтвердите ваш email адрес.\n\nПерейдите по ссылке: ${verificationLink}`,
      });
      
      return { sent: true };
    } catch (error) {
      console.error("[Email] Ошибка отправки verification email:", error);
      return {
        sent: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    console.error("[Email] Ошибка отправки verification email:", error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Отправляет приветственное письмо с паролем (для старой системы регистрации)
 */
export async function sendWelcomeEmail(
  email: string,
  password?: string,
  magicLink?: string
): Promise<SendEmailResult> {
  try {
    const subject = "Добро пожаловать в МойСоюз!";
    
    // Если есть magic link - используем его, иначе пароль
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">👋 Добро пожаловать!</h1>
    </div>
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
        Ваш аккаунт успешно создан!
      </p>
      ${magicLink ? `
      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
        Перейдите по ссылке ниже, чтобы войти в свой личный кабинет.
      </p>
      <div style="text-align: center; margin: 40px 0;">
        <a href="${magicLink}"
           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
          Войти в личный кабинет
        </a>
      </div>
      <p style="margin: 30px 0 10px; font-size: 14px; color: #666666;">
        Или скопируйте ссылку: ${magicLink}
      </p>
      <p style="margin: 0 0 30px; font-size: 14px; color: #666666;">
        Ссылка действительна 15 минут.
      </p>
      ` : password ? `
      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
        Ваш временный пароль: <strong>${password}</strong>
      </p>
      <p style="margin: 0 0 30px; font-size: 14px; color: #666666;">
        Рекомендуем изменить пароль после первого входа.
      </p>
      <div style="text-align: center; margin: 40px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://myunion.pro'}/login" 
           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
          Войти в аккаунт
        </a>
      </div>
      ` : ''}
    </div>
  </div>
</body>
</html>
    `.trim();

    const textContent = magicLink 
      ? `Ваш аккаунт успешно создан!\n\nПерейдите по ссылке ниже, чтобы войти в свой личный кабинет:\n\n${magicLink}\n\nСсылка действительна 15 минут.`
      : password
      ? `Ваш аккаунт успешно создан!\n\nВаш временный пароль: ${password}\n\nРекомендуем изменить пароль после первого входа.\n\nВойти в аккаунт: ${process.env.NEXT_PUBLIC_APP_URL || 'https://myunion.pro'}/login`
      : `Ваш аккаунт успешно создан!\n\nВойти в аккаунт: ${process.env.NEXT_PUBLIC_APP_URL || 'https://myunion.pro'}/login`;

    console.log("[Email] Welcome email готов к отправке:", email);
    
    // Отправляем через SMTP
    try {
      await sendEmail({
        to: email,
        subject,
        html: htmlContent,
        text: textContent,
      });
      
      return {
        success: true,
        messageId: "sent-" + Date.now(),
      };
    } catch (error) {
      console.error("[Email] Ошибка отправки welcome email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    console.error("[Email] Ошибка отправки welcome email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Лид «проблема со входом» из Telegram-бота → на почту поддержки.
 */
export async function sendLoginIssueLeadEmail(params: {
  telegramChatId: string;
  telegramUsername: string | null;
  fromFirstName?: string | null;
  fromLastName?: string | null;
  linkedUserId?: string | null;
  linkedUserEmail?: string | null;
  contactEmail?: string | null;
  description: string;
}): Promise<void> {
  const to = process.env.SUPPORT_LEAD_INBOX_EMAIL || getSupportEmail();
  const subject = "[МойСоюз] Проблема со входом (Telegram)";
  const text = [
    "Заявка: проблема со входом на сайт (ссылка с страницы входа → Telegram-бот).",
    "",
    `Telegram chat_id: ${params.telegramChatId}`,
    params.telegramUsername ? `Username: @${params.telegramUsername}` : "Username: не указан",
    `Имя в Telegram: ${[params.fromFirstName, params.fromLastName].filter(Boolean).join(" ") || "—"}`,
    params.linkedUserId ? `Пользователь в БД: ${params.linkedUserId}` : "Аккаунт в БД не привязан к этому Telegram",
    params.linkedUserEmail ? `Email в профиле: ${params.linkedUserEmail}` : null,
    params.contactEmail ? `Email из заявки: ${params.contactEmail}` : null,
    "",
    "Описание:",
    params.description,
  ]
    .filter((line): line is string => line != null)
    .join("\n");

  await sendEmail({
    to,
    subject,
    text,
    html: `<pre style="font-family:system-ui,Segoe UI,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtmlForEmail(
      text
    )}</pre>`,
  });
}
