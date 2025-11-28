/**
 * Email функции для отправки magic links и уведомлений
 */

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
 * Универсальная функция для отправки email
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  try {
    console.log("[Email] Готово к отправке:");
    console.log("  To:", options.to);
    console.log("  Subject:", options.subject);

    // TODO: Интеграция с email сервисом (SendGrid, Mailgun, или SMTP)
    // Пример для SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({
    //   to: options.to,
    //   from: 'noreply@myunion.pro',
    //   subject: options.subject,
    //   html: options.html,
    //   text: options.text,
    // });

    console.log("[Email] ⚠️ ВНИМАНИЕ: Email НЕ отправлен (нужна настройка SMTP/SendGrid)");
    console.log("[Email] HTML preview:", options.html.slice(0, 200));
  } catch (error) {
    console.error("[Email] Ошибка отправки:", error);
    throw error;
  }
}

/**
 * Отправляет Magic Link на email для авторизации
 */
export async function sendMagicLinkEmail(
  email: string,
  magicLink: string,
  isNewUser: boolean,
  firstName?: string
): Promise<SendEmailResult> {
  try {
    // TODO: Интеграция с email сервисом (SendGrid, Mailgun, или SMTP)
    // Пока просто логируем
    
    const name = firstName ? `, ${firstName}` : "";
    const subject = isNewUser ? "Добро пожаловать в МойСоюз!" : "Вход в МойСоюз";
    
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

    // TODO: Реальная отправка через email сервис
    // Пример для SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({
    //   to: email,
    //   from: 'noreply@myunion.pro',
    //   subject: subject,
    //   html: htmlContent,
    // });

    // Пока возвращаем успех (для тестирования)
    console.log("[Email] ⚠️ ВНИМАНИЕ: Email НЕ отправлен (нужна настройка SMTP/SendGrid)");
    console.log("[Email] Magic Link для тестирования:", magicLink);

    return {
      success: true,
      messageId: "test-" + Date.now(),
    };
  } catch (error) {
    console.error("[Email] Ошибка отправки:", error);
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
    // TODO: Реальная отправка через email сервис
    
    return { sent: true };
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
  password: string
): Promise<SendEmailResult> {
  try {
    const subject = "Добро пожаловать в МойСоюз!";
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
    </div>
  </div>
</body>
</html>
    `.trim();

    console.log("[Email] Welcome email готов к отправке:", email);
    // TODO: Реальная отправка через email сервис
    
    return {
      success: true,
      messageId: "test-" + Date.now(),
    };
  } catch (error) {
    console.error("[Email] Ошибка отправки welcome email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
