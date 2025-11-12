import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendVerificationEmail(email: string, code: string) {
  const mailOptions = {
    from: process.env.SMTP_FROM,
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

  await transporter.sendMail(mailOptions);
}

export async function sendWelcomeEmail(email: string, password: string) {
  const mailOptions = {
    from: process.env.SMTP_FROM,
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

  await transporter.sendMail(mailOptions);
}


