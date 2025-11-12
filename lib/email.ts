import nodemailer from "nodemailer";
import { getSmtpConfig } from "./settings";

type EmailConfig = {
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
};

function maskConfig(config: EmailConfig) {
  return {
    host: config.host || "не задан",
    port: config.port || "не задан",
    user: config.user || "не задан",
    from: config.from || "не задан",
    pass: config.pass ? "***" : "не задан",
  };
}

const EMAIL_FALLBACK_MESSAGE =
  "[email] SMTP настройки не найдены. Письмо не отправлено, используем fallback лог.";

const isEmailConfigured = (config: EmailConfig): boolean =>
  !!config.host && !!config.port && !!config.user && !!config.pass && !!config.from;

async function resolveEmailConfig(): Promise<EmailConfig> {
  const config = await getSmtpConfig();
  return {
    host: config.host ?? "",
    port: config.port ?? "",
    user: config.user ?? "",
    pass: config.pass ?? "",
    from: config.from ?? "",
  };
}

async function createTransporter() {
  const config = await resolveEmailConfig();

  if (process.env.NODE_ENV === "development") {
    console.log("[email] Текущие SMTP настройки:", maskConfig(config));
  }

  if (!isEmailConfigured(config)) {
    return { transporter: null, config };
  }

  const port = parseInt(config.port || "465", 10);
  const secure = port === 465;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port,
    secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return { transporter, config };
}

function logEmailFallback({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  console.warn(
    "[email] SMTP настройки не найдены. Письмо не отправлено, используем fallback лог.",
  );
  console.info("[email] Получатель:", to);
  console.info("[email] Тема:", subject);
  console.info("[email] HTML:\n", html);
}

type EmailResult = {
  sent: boolean;
  info?: unknown;
  fallback?: boolean;
  error?: string;
};

export async function sendVerificationEmail(email: string, code: string): Promise<EmailResult> {
  const { transporter, config } = await createTransporter();

  const mailOptions = {
    from: config.from || "support@myunion.pro",
    to: email,
    subject: "Подтверждение регистрации MyUnion",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #465fff;">Добро пожаловать в MyUnion!</h2>
        <p>Ваш код подтверждения:</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="margin: 0; font-size: 32px; letter-spacing: 8px; color: #465fff;">${code}</h1>
        </div>
        <p>Код действителен в течение 10 минут.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          Если вы не регистрировались в MyUnion, проигнорируйте это письмо.
        </p>
      </div>
    `,
  };

  if (!transporter) {
    logEmailFallback(mailOptions);
    return { sent: false, fallback: true, info: EMAIL_FALLBACK_MESSAGE };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    return { sent: true, info };
  } catch (error) {
    console.error("[email] Ошибка при отправке письма:", error);
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendWelcomeEmail(email: string, password: string): Promise<EmailResult> {
  const { transporter, config } = await createTransporter();

  const mailOptions = {
    from: config.from || "support@myunion.pro",
    to: email,
    subject: "Добро пожаловать в MyUnion",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #465fff;">Добро пожаловать в MyUnion!</h2>
        <p>Ваша регистрация успешно завершена.</p>
        <p>Ваши учетные данные для входа:</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Пароль:</strong> ${password}</p>
        </div>
        <p>Сохраните эти данные в надежном месте. Вы сможете изменить пароль в настройках профиля.</p>
        <p style="margin-top: 30px;">
          <a href="${process.env.NEXTAUTH_URL}/login" style="background: #465fff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Войти в систему
          </a>
        </p>
      </div>
    `,
  };

  if (!transporter) {
    logEmailFallback(mailOptions);
    return { sent: false, fallback: true, info: EMAIL_FALLBACK_MESSAGE };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    return { sent: true, info };
  } catch (error) {
    console.error("[email] Ошибка при отправке письма:", error);
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}


