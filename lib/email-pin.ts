import { prisma } from "./prisma";
import crypto from "crypto";
import nodemailer from "nodemailer";

// Генерация 6-значного PIN-кода
export function generateEmailPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Хеширование PIN-кода (SHA-256)
export function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

// Создание транспорта для отправки email
function createEmailTransport() {
  // Используем SMTP конфигурацию из env
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.mail.ru",
    port: parseInt(process.env.SMTP_PORT || "465"),
    secure: true, // true для 465, false для других портов
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

// Отправка PIN-кода на email
export async function sendEmailPin(
  email: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[Email PIN] Отправка PIN на email:", email);

    // Генерируем PIN-код
    const pin = generateEmailPin();
    const hashedPin = hashPin(pin);

    // Устанавливаем срок действия: 10 минут
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Сохраняем в базу данных
    await prisma.emailPinCode.create({
      data: {
        email,
        hashedPin,
        expiresAt,
        userId: userId || null,
      },
    });

    console.log("[Email PIN] ✅ PIN сохранен в БД, истекает:", expiresAt);

    // Отправляем email
    const transporter = createEmailTransport();

    const mailOptions = {
      from: `"МойСоюз" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Код подтверждения email — МойСоюз",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: #ffffff;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #2563eb;
            }
            .pin-code {
              background: #f3f4f6;
              border: 2px dashed #2563eb;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 30px 0;
            }
            .pin-number {
              font-size: 32px;
              font-weight: bold;
              color: #2563eb;
              letter-spacing: 8px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 12px;
              color: #6b7280;
            }
            .warning {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 12px;
              margin: 20px 0;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">МойСоюз</div>
              <p>Подтверждение email адреса</p>
            </div>
            
            <p>Здравствуйте!</p>
            
            <p>Вы запросили код подтверждения для вашего email адреса в системе МойСоюз.</p>
            
            <div class="pin-code">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Ваш код подтверждения:</p>
              <div class="pin-number">${pin}</div>
            </div>
            
            <div class="warning">
              ⚠️ <strong>Важно:</strong> Код действителен в течение <strong>10 минут</strong>.
            </div>
            
            <p>Если вы не запрашивали этот код, просто проигнорируйте это письмо.</p>
            
            <div class="footer">
              <p>© ${new Date().getFullYear()} МойСоюз — Московская областная организация Профсоюза работников здравоохранения РФ</p>
              <p>Это автоматическое письмо, пожалуйста, не отвечайте на него.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
МойСоюз - Подтверждение email адреса

Здравствуйте!

Вы запросили код подтверждения для вашего email адреса в системе МойСоюз.

Ваш код подтверждения: ${pin}

⚠️ Важно: Код действителен в течение 10 минут.

Если вы не запрашивали этот код, просто проигнорируйте это письмо.

© ${new Date().getFullYear()} МойСоюз — Московская областная организация Профсоюза работников здравоохранения РФ
      `.trim(),
    };

    // Проверяем подключение перед отправкой
    try {
      await transporter.verify();
      console.log("[Email PIN] ✅ SMTP сервер готов к отправке");
    } catch (verifyError) {
      console.error("[Email PIN] ❌ Ошибка проверки SMTP подключения:", verifyError);
      return {
        success: false,
        error: `Ошибка подключения к SMTP серверу: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`,
      };
    }

    const result = await transporter.sendMail(mailOptions);

    console.log("[Email PIN] ✅ Email отправлен:", {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
    });

    if (result.rejected && result.rejected.length > 0) {
      console.error("[Email PIN] ❌ Email отклонен:", result.rejected);
      return {
        success: false,
        error: `Email отклонен: ${result.rejected.join(", ")}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[Email PIN] ❌ Ошибка отправки email:", error);
    
    let errorMessage = "Неизвестная ошибка";
    if (error instanceof Error) {
      errorMessage = error.message;
      // Дополнительная информация для распространенных ошибок
      if (error.message.includes("Invalid login")) {
        errorMessage = "Неверные учетные данные SMTP";
      } else if (error.message.includes("ECONNREFUSED")) {
        errorMessage = "Не удалось подключиться к SMTP серверу";
      } else if (error.message.includes("ETIMEDOUT")) {
        errorMessage = "Таймаут подключения к SMTP серверу";
      }
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Проверка PIN-кода
export async function verifyEmailPin(
  email: string,
  pin: string
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  try {
    console.log("[Email PIN] Проверка PIN для email:", email);

    const hashedPin = hashPin(pin);

    // Ищем неиспользованный, не истекший PIN-код
    const pinRecord = await prisma.emailPinCode.findFirst({
      where: {
        email,
        hashedPin,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!pinRecord) {
      console.log("[Email PIN] ❌ PIN не найден или истек");
      return { valid: false, error: "Неверный или истекший код" };
    }

    // Помечаем код как использованный
    await prisma.emailPinCode.update({
      where: { id: pinRecord.id },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    console.log("[Email PIN] ✅ PIN верифицирован");

    return {
      valid: true,
      userId: pinRecord.userId || undefined,
    };
  } catch (error) {
    console.error("[Email PIN] ❌ Ошибка проверки:", error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Очистка истекших PIN-кодов (вызывается периодически)
export async function cleanupExpiredEmailPins(): Promise<number> {
  try {
    const result = await prisma.emailPinCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true, usedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, // Удаляем использованные коды старше 24 часов
        ],
      },
    });

    console.log(`[Email PIN] 🧹 Удалено ${result.count} истекших PIN-кодов`);
    return result.count;
  } catch (error) {
    console.error("[Email PIN] ❌ Ошибка очистки:", error);
    return 0;
  }
}

