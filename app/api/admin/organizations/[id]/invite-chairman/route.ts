import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { encryptPassword } from "@/lib/best-benefits-password";
import { createBestBenefitsUser } from "@/lib/best-benefits-users";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/admin/organizations/[id]/invite-chairman
 * Отправляет инвайт-ссылку председателю организации и создает учетную запись
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      email,
      phone,
      firstName,
      lastName,
      middleName,
      jobTitle,
    } = body;

    // Валидация
    if (!email || !phone || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Email, телефон, имя и фамилия обязательны" },
        { status: 400 }
      );
    }

    // Проверяем существование организации
    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Организация не найдена" },
        { status: 404 }
      );
    }

    // Проверяем, не существует ли уже пользователь с таким email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Если пользователь уже существует, проверяем, является ли он председателем этой организации
      if (existingUser.organizationId === id && existingUser.role === "PPO_HEAD") {
        return NextResponse.json(
          { error: "Пользователь уже является председателем этой организации" },
          { status: 400 }
        );
      }
      // Если пользователь существует, но не связан с этой организацией, обновляем его
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          organizationId: id,
          role: "PPO_HEAD",
          firstName: firstName,
          lastName: lastName,
          middleName: middleName || null,
          phone: phone,
          jobTitle: jobTitle || null,
        },
      });

      // Генерируем инвайт-токен
      const inviteToken = crypto.randomBytes(32).toString("hex");
      const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 дней

      await prisma.user.update({
        where: { id: updatedUser.id },
        data: {
          resetToken: inviteToken,
          resetTokenExpires: inviteTokenExpires,
        },
      });

      // Отправляем email с инвайт-ссылкой
      const baseUrl = process.env.NEXTAUTH_URL || "https://myunion.pro";
      const inviteUrl = `${baseUrl}/auth/invite?token=${inviteToken}`;

      await sendChairmanInviteEmail(email, firstName, lastName, organization.name, inviteUrl);

      return NextResponse.json({
        success: true,
        message: "Инвайт-ссылка отправлена существующему пользователю",
        userId: updatedUser.id,
      });
    }

    // Создаем нового пользователя
    const generatedPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);
    const encryptedBbPassword = encryptPassword(generatedPassword);

    // Генерируем инвайт-токен
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 дней

    // Создаем пользователя
    const newUser = await prisma.user.create({
      data: {
        email,
        phone,
        password: hashedPassword,
        firstName,
        lastName,
        middleName: middleName || null,
        jobTitle: jobTitle || null,
        organizationId: id,
        role: "PPO_HEAD",
        membershipStatus: "APPROVED",
        emailVerified: null, // Email будет подтвержден при переходе по инвайт-ссылке
        resetToken: inviteToken,
        resetTokenExpires: inviteTokenExpires,
        bestBenefitsPassword: encryptedBbPassword,
      },
    });

    // Создаем учетную запись в BestBenefits
    try {
      const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ");
      const bbUser = await createBestBenefitsUser({
        name: fullName,
        email: email,
        password: generatedPassword,
        city_id: null, // Можно добавить позже
      });

      const bbUserId = bbUser.data?.id;
      
      if (bbUserId) {
        await prisma.user.update({
          where: { id: newUser.id },
          data: {
            bestBenefitsUserId: String(bbUserId),
            bestBenefitsStatus: "active",
            bestBenefitsCreatedAt: new Date(),
          },
        });
        console.log("[invite-chairman] ✅ BestBenefits user created:", bbUserId);
      }
    } catch (bbError) {
      console.error("[invite-chairman] ⚠️ Failed to create BestBenefits user:", bbError);
      // Не блокируем создание пользователя, если BestBenefits недоступен
    }

    // Отправляем email с инвайт-ссылкой
    const baseUrl = process.env.NEXTAUTH_URL || "https://myunion.pro";
    const inviteUrl = `${baseUrl}/auth/invite?token=${inviteToken}`;

    await sendChairmanInviteEmail(email, firstName, lastName, organization.name, inviteUrl);

    return NextResponse.json({
      success: true,
      message: "Председатель создан, инвайт-ссылка отправлена",
      userId: newUser.id,
    });
  } catch (error: any) {
    console.error("[admin/organizations] POST invite-chairman error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при отправке инвайта",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * Отправляет email с инвайт-ссылкой председателю
 */
async function sendChairmanInviteEmail(
  email: string,
  firstName: string,
  lastName: string,
  organizationName: string,
  inviteUrl: string
) {
  const fullName = `${firstName} ${lastName}`;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Приглашение в МойСоюз</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
        👋 Добро пожаловать, ${firstName}!
      </h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
        Здравствуйте, ${fullName}!
      </p>
      
      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
        Вы назначены Председателем первичной профсоюзной организации <strong>${organizationName}</strong>.
      </p>
      
      <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #333333;">
        Теперь вы можете управлять своим Профсоюзным комитетом через личный кабинет МойСоюз. 
        Нажмите кнопку ниже, чтобы завершить регистрацию и получить доступ к кабинету Председателя.
      </p>
      
      <!-- Button -->
      <div style="text-align: center; margin: 40px 0;">
        <a href="${inviteUrl}" 
           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
          🚀 Завершить регистрацию
        </a>
      </div>
      
      <p style="margin: 30px 0 10px; font-size: 14px; color: #666666;">
        Или скопируйте эту ссылку в браузер:
      </p>
      <div style="padding: 12px; background-color: #f5f5f5; border-radius: 6px; word-break: break-all;">
        <a href="${inviteUrl}" style="color: #667eea; text-decoration: none; font-size: 13px;">
          ${inviteUrl}
        </a>
      </div>
      
      <div style="margin-top: 30px; padding: 20px; background-color: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
        <h3 style="margin: 0 0 10px; font-size: 16px; color: #1e40af;">
          📋 Что вы сможете делать в кабинете Председателя:
        </h3>
        <ul style="margin: 0; padding-left: 20px; color: #1e40af; line-height: 1.8;">
          <li>Управлять документами профкома (Повестка дня, Протоколы, Постановления)</li>
          <li>Обрабатывать обращения членов профсоюза</li>
          <li>Создавать новости и управлять каналами публикации</li>
          <li>Валидировать заявки на вступление в профсоюз</li>
          <li>Создавать группы и управлять чатами</li>
        </ul>
      </div>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; font-size: 13px; color: #999999; line-height: 1.6;">
          ⏱ Эта ссылка действительна <strong>7 дней</strong><br>
          ⚠️ Если вы не ожидали это письмо, свяжитесь с администратором системы
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

  const textContent = `
Добро пожаловать, ${firstName}!

Вы назначены Председателем первичной профсоюзной организации ${organizationName}.

Теперь вы можете управлять своим Профсоюзным комитетом через личный кабинет МойСоюз.

Завершите регистрацию по ссылке: ${inviteUrl}

Что вы сможете делать в кабинете Председателя:
- Управлять документами профкома (Повестка дня, Протоколы, Постановления)
- Обрабатывать обращения членов профсоюза
- Создавать новости и управлять каналами публикации
- Валидировать заявки на вступление в профсоюз
- Создавать группы и управлять чатами

Эта ссылка действительна 7 дней.

МойСоюз — современная платформа для профсоюзов
Техподдержка: support@myunion.pro
  `.trim();

  await sendEmail({
    to: email,
    subject: `Приглашение в МойСоюз — Председатель ${organizationName}`,
    html: htmlContent,
    text: textContent,
  });
}

