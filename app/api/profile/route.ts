import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateUsersCache } from "@/lib/cache-invalidation";
import { capitalizeName } from "@/lib/utils/nameFormatting";
import { EDUCATION_LEVELS } from "@/lib/constants/education";
import { normalizePhone, getPhoneDigits, isSamePhone } from "@/lib/utils/phone";
import { saveUserProfileToKnowledgeBase } from "@/lib/user-knowledge-base";
import { sendMassNotification } from "@/lib/notifications";
// Удалено: SystemMessages - больше не используется

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function normalizeEducation(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const matched = EDUCATION_LEVELS.find(
    (level) => level.toLowerCase() === normalized.toLowerCase(),
  );
  return matched ?? normalized;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error("[profile] GET: No session or user ID");
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    console.log("[profile] GET: Fetching user data for ID:", session.user.id);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        dateOfBirth: true,
        address: true,
        preferredDiscountCity: true,
        avatarUrl: true,
        jobTitle: true,
        workplace: true,
        workplaceInn: true,
        directorName: true,
        directorPosition: true,
        profession: true,
        education: true,
        employmentStatus: true,
        hobbies: true,
        aboutMe: true,
        hasChildren: true,
        childrenInfo: true,
        maritalStatus: true,
        spouseInfo: true,
        additionalInfo: true,
        membershipStatus: true,
        organizationId: true,
        profileChangedAfterDocuments: true,
        profileLastModified: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            inn: true,
          },
        },
      },
    });

    if (!user) {
      console.error("[profile] GET: User not found for ID:", session.user.id);
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    console.log("[profile] GET: User found:", {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      hasAvatar: !!user.avatarUrl,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        preferredDiscountCity: user.preferredDiscountCity,
        avatarUrl: user.avatarUrl,
        jobTitle: user.jobTitle,
        workplace: user.workplace,
        workplaceInn: user.workplaceInn,
        directorName: user.directorName,
        directorPosition: user.directorPosition,
        profession: user.profession,
        education: user.education,
        employmentStatus: user.employmentStatus,
        hobbies: user.hobbies,
        aboutMe: user.aboutMe,
        hasChildren: user.hasChildren,
        childrenInfo: user.childrenInfo,
        maritalStatus: user.maritalStatus,
        spouseInfo: user.spouseInfo,
        additionalInfo: user.additionalInfo,
        membershipStatus: user.membershipStatus, // Статус верификации (PENDING_VERIFICATION, APPROVED и т.д.)
        organizationId: user.organizationId, // Добавляем organizationId для удобства
        organization: user.organization,
        profileChangedAfterDocuments: user.profileChangedAfterDocuments,
        profileLastModified: user.profileLastModified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("[profile] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить профиль" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error("[profile] PUT: No session or user ID");
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    console.log("[profile] PUT: Updating profile for user ID:", session.user.id, "Data:", body);

    const firstName = normalizeString(body.firstName);
    const lastName = normalizeString(body.lastName);
    const middleName = normalizeString(body.middleName);
    const email = normalizeString(body.email);
    const phone = normalizeString(body.phone);
    const address = normalizeString(body.address);
    const preferredDiscountCity = normalizeString(body.preferredDiscountCity);
    const jobTitle = normalizeString(body.jobTitle);
    const workplace = normalizeString(body.workplace);
    const workplaceInn = normalizeString(body.workplaceInn);
    const directorName = normalizeString(body.directorName);
    const directorPosition = normalizeString(body.directorPosition);
    const profession = normalizeString(body.profession);
    const education = normalizeEducation(body.education);
    const organizationId = normalizeString(body.organizationId);

    // Валидация организации, если указана
    if (organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!org) {
        console.warn("[profile] Organization not found:", organizationId);
        return NextResponse.json(
          { error: `Организация с ID ${organizationId} не найдена. Пожалуйста, выберите организацию из списка.` },
          { status: 400 }
        );
      }
      console.log("[profile] Validating organization:", {
        id: org.id,
        name: org.name,
        type: org.type,
      });
    }

    let dateOfBirth: Date | null = null;
    if (body.dateOfBirth) {
      const date = new Date(body.dateOfBirth);
      if (!Number.isNaN(date.getTime())) {
        dateOfBirth = date;
      }
    }

    // Получаем пользователя с bestBenefitsPassword перед обновлением
    const userBeforeUpdate = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        firstName: true,
        lastName: true,
        middleName: true,
        email: true, // Нужен для защиты от изменения
        dateOfBirth: true,
        phone: true,
        address: true,
        jobTitle: true,
        workplace: true,
        workplaceInn: true,
        directorName: true,
        directorPosition: true,
        profession: true,
        education: true,
        organizationId: true,
        profileChangedAfterDocuments: true, // Нужен для проверки изменения флага
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    // === НОРМАЛИЗАЦИЯ ТЕЛЕФОНА ===
    const normalizedPhone = normalizePhone(phone);
    const phoneDigits = getPhoneDigits(normalizedPhone);
    
    // === ПРОВЕРКА УНИКАЛЬНОСТИ ТЕЛЕФОНА ===
    if (normalizedPhone && !isSamePhone(normalizedPhone, userBeforeUpdate?.phone)) {
      // Проверяем не занят ли номер другим пользователем
      const existingUserWithPhone = await prisma.user.findFirst({
        where: {
          id: { not: session.user.id },
          OR: [
            { phone: normalizedPhone },
            { authPhone: normalizedPhone },
          ],
        },
        select: { id: true, phone: true, firstName: true, lastName: true },
      });
      
      if (existingUserWithPhone) {
        console.warn("[profile] Phone already used by another user:", normalizedPhone, existingUserWithPhone.id);
        return NextResponse.json(
          { 
            error: "Этот номер телефона уже используется другим пользователем",
            existingUser: {
              id: existingUserWithPhone.id,
              name: [existingUserWithPhone.firstName, existingUserWithPhone.lastName].filter(Boolean).join(" ") || "Пользователь"
            },
            canMerge: true // Можно предложить объединить аккаунты
          },
          { status: 409 } // Conflict
        );
      }
      
      // Записываем историю смены телефона
      try {
        await prisma.phoneHistory.create({
          data: {
            userId: session.user.id,
            phone: normalizedPhone,
            phoneNormalized: phoneDigits,
            changeType: "PROFILE_UPDATE",
            previousPhone: userBeforeUpdate?.phone || null,
            source: "profile",
          },
        });
        console.log("[profile] Phone change recorded in history:", userBeforeUpdate?.phone, "->", normalizedPhone);
      } catch (historyError) {
        // Не блокируем сохранение профиля из-за ошибки записи истории
        console.error("[profile] Failed to record phone history:", historyError);
      }
    }

    // === ПРОВЕРКА УНИКАЛЬНОСТИ EMAIL ===
    if (email && email !== userBeforeUpdate?.email) {
      const existingUserWithEmail = await prisma.user.findFirst({
        where: {
          id: { not: session.user.id },
          email: email.toLowerCase(),
        },
        select: { id: true, email: true },
      });
      
      if (existingUserWithEmail) {
        console.warn("[profile] Email already used by another user:", email);
        return NextResponse.json(
          { error: "Этот email уже используется другим пользователем" },
          { status: 400 }
        );
      }
    }

    // ВАЖНО: Вычисляем фактические значения, которые будут сохранены (с учетом логики сохранения старых значений)
    // Это нужно для правильного определения hasProfileChanges
    const actualFirstName = firstName ? capitalizeName(firstName) : (userBeforeUpdate?.firstName || null);
    const actualLastName = lastName ? capitalizeName(lastName) : (userBeforeUpdate?.lastName || null);
    const actualMiddleName = middleName ? capitalizeName(middleName) : (userBeforeUpdate?.middleName || null);
    const actualDateOfBirth = dateOfBirth || (userBeforeUpdate?.dateOfBirth || null);
    const actualPhone = normalizedPhone || (userBeforeUpdate?.phone || null);
    const actualAddress = address || (userBeforeUpdate?.address || null);
    const actualJobTitle = jobTitle || (userBeforeUpdate?.jobTitle || null);
    const actualWorkplace = workplace || (userBeforeUpdate?.workplace || null);
    const actualWorkplaceInn = workplaceInn || (userBeforeUpdate?.workplaceInn || null);
    const actualDirectorName = directorName || (userBeforeUpdate?.directorName || null);
    const actualDirectorPosition = directorPosition || (userBeforeUpdate?.directorPosition || null);
    const actualProfession = profession || (userBeforeUpdate?.profession || null);
    const actualEducation = education || (userBeforeUpdate?.education || null);

    // Функция для нормализации даты к ISO строке для сравнения
    const normalizeDateForComparison = (date: Date | string | null | undefined): string | null => {
      if (!date) return null;
      if (date instanceof Date) {
        return date.toISOString();
      }
      if (typeof date === 'string') {
        const parsed = new Date(date);
        return isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
      return null;
    };

    // Проверяем, изменились ли ключевые поля профиля, которые влияют на документы
    // Используем фактические значения, которые будут сохранены
    // ВАЖНО: organizationId сравниваем только если он явно передан в body
    // Это предотвращает ложное определение изменений при автосохранении других полей
    const actualOrganizationId = body.organizationId !== undefined 
      ? (organizationId || null)
      : (userBeforeUpdate?.organizationId || null);
    
    const documentsAffectingFields = [
      { old: userBeforeUpdate?.firstName, new: actualFirstName },
      { old: userBeforeUpdate?.lastName, new: actualLastName },
      { old: userBeforeUpdate?.middleName, new: actualMiddleName },
      { old: normalizeDateForComparison(userBeforeUpdate?.dateOfBirth), new: normalizeDateForComparison(actualDateOfBirth) },
      { old: normalizePhone(userBeforeUpdate?.phone), new: normalizePhone(actualPhone) },
      { old: userBeforeUpdate?.address, new: actualAddress },
      { old: userBeforeUpdate?.jobTitle, new: actualJobTitle },
      { old: userBeforeUpdate?.workplace, new: actualWorkplace },
      { old: userBeforeUpdate?.workplaceInn, new: actualWorkplaceInn },
      { old: userBeforeUpdate?.directorName, new: actualDirectorName },
      { old: userBeforeUpdate?.directorPosition, new: actualDirectorPosition },
      { old: userBeforeUpdate?.profession, new: actualProfession },
      { old: userBeforeUpdate?.education, new: actualEducation },
      { old: userBeforeUpdate?.organizationId, new: actualOrganizationId },
    ];

    const hasProfileChanges = documentsAffectingFields.some(
      (field) => field.old !== field.new && (field.old || field.new)
    );

    // Проверяем, есть ли сгенерированные документы
    const hasGeneratedDocuments = await prisma.document.count({
      where: {
        userId: session.user.id,
        type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
        status: { in: ["GENERATED", "SIGNED"] },
      },
    }) > 0;

    // Email нельзя изменить после первого сохранения (для синхронизации с BestBenefits)
    const emailToSave = userBeforeUpdate?.email ? userBeforeUpdate.email : email;
    
    if (userBeforeUpdate?.email && email && userBeforeUpdate.email !== email) {
      console.warn("[profile] Attempt to change email from", userBeforeUpdate.email, "to", email, "- ignored");
    }

    console.log("[profile] PUT: Updating user with data:", {
      firstName: firstName ? capitalizeName(firstName) : null,
      lastName: lastName ? capitalizeName(lastName) : null,
      phone: normalizedPhone,
      organizationId: organizationId || null,
    });

    // ВАЖНО: Не перезаписываем существующие данные на null, если приходят пустые строки
    // Используем существующие значения, если новые пустые
    const updateData: any = {};
    
    // Обновляем только если новое значение не пустое, или если нужно установить null явно
    if (firstName !== null) {
      updateData.firstName = firstName ? capitalizeName(firstName) : (userBeforeUpdate?.firstName || null);
    }
    if (lastName !== null) {
      updateData.lastName = lastName ? capitalizeName(lastName) : (userBeforeUpdate?.lastName || null);
    }
    if (middleName !== null) {
      updateData.middleName = middleName ? capitalizeName(middleName) : (userBeforeUpdate?.middleName || null);
    }
    if (address !== null) {
      updateData.address = address || (userBeforeUpdate?.address || null);
    }
    if (jobTitle !== null) {
      updateData.jobTitle = jobTitle || (userBeforeUpdate?.jobTitle || null);
    }
    if (workplace !== null) {
      updateData.workplace = workplace || (userBeforeUpdate?.workplace || null);
    }
    if (workplaceInn !== null) {
      updateData.workplaceInn = workplaceInn || (userBeforeUpdate?.workplaceInn || null);
    }
    if (directorName !== null) {
      updateData.directorName = directorName || (userBeforeUpdate?.directorName || null);
    }
    if (directorPosition !== null) {
      updateData.directorPosition = directorPosition || (userBeforeUpdate?.directorPosition || null);
    }
    if (profession !== null) {
      updateData.profession = profession || (userBeforeUpdate?.profession || null);
    }
    if (education !== null) {
      updateData.education = education || (userBeforeUpdate?.education || null);
    }
    if (dateOfBirth !== null || body.dateOfBirth !== undefined) {
      updateData.dateOfBirth = dateOfBirth || (userBeforeUpdate?.dateOfBirth || null);
    }
    if (preferredDiscountCity !== null) {
      updateData.preferredDiscountCity = preferredDiscountCity ? capitalizeName(preferredDiscountCity) : null;
    }
    
    // Телефон и email обрабатываются отдельно (уже проверены выше)
    updateData.email = emailToSave;
    updateData.phone = normalizedPhone || (userBeforeUpdate?.phone || null);
    
    // ВАЖНО: organizationId обновляем только если он явно передан в body
    // Это предотвращает случайное стирание организации при автосохранении других полей
    if (body.organizationId !== undefined) {
      updateData.organizationId = organizationId || null;
      updateData.organizationName = null; // Очищаем старое текстовое поле (теперь используем только ID)
    }
    
    // Устанавливаем флаг изменения профиля, если есть документы и данные изменились
    const wasProfileChangedAfterDocuments = userBeforeUpdate?.profileChangedAfterDocuments || false;
    
    if (hasGeneratedDocuments && hasProfileChanges) {
      updateData.profileChangedAfterDocuments = true;
    }
    if (hasProfileChanges) {
      updateData.profileLastModified = new Date();
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      include: {
        organization: true,
      },
    });

    // Сохраняем данные профиля в базу знаний для ИИ (асинхронно, не блокируем ответ)
    saveUserProfileToKnowledgeBase(updatedUser).catch((error) => {
      console.error("[profile] Ошибка при сохранении в базу знаний:", error);
    });

    // Если флаг изменился с false на true - уведомляем супер админов
    if (hasGeneratedDocuments && hasProfileChanges && !wasProfileChangedAfterDocuments) {
      // Уведомляем супер админов асинхронно (не блокируем ответ)
      notifySuperAdminsAboutDocumentRegeneration(updatedUser.id, session.user.id).catch((error) => {
        console.error("[profile] Ошибка при отправке уведомления супер админам:", error);
      });
    }

    // Синхронизация с BestBenefits перенесена в /api/user/verify-email
    // Аккаунт создается только ПОСЛЕ подтверждения email пользователем
    console.log("[profile] Profile saved. BestBenefits sync will happen after email verification.");

    // Проверяем готовность профиля для генерации документов
    const requiredFields = [
      updatedUser.firstName,
      updatedUser.lastName,
      updatedUser.dateOfBirth,
      updatedUser.phone,
      updatedUser.address,
      updatedUser.jobTitle,
      updatedUser.profession,
      updatedUser.education,
      updatedUser.organizationId,
    ];

    const isProfileComplete = requiredFields.every((field) => field !== null && field !== undefined && field !== "");

    // Проверяем есть ли уже сгенерированные документы
    const hasGeneratedDocs = await prisma.document.count({
      where: {
        userId: session.user.id,
        type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
        status: { in: ["GENERATED", "SIGNED", "PENDING", "APPROVED"] },
      },
    }) > 0;

    // Удалено: отправка системных сообщений в чат - больше не используется
    if (isProfileComplete && !hasGeneratedDocs) {
      console.log("[profile] Profile completed, ready for document generation");
    }

    // Инвалидируем кеш пользователей (профиль мог измениться)
    await invalidateUsersCache();

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error("[profile] PUT error:", error);
    return NextResponse.json(
      { error: "Не удалось обновить профиль" },
      { status: 500 },
    );
  }
}

/**
 * Уведомляет супер админов о необходимости перегенерации документов
 */
async function notifySuperAdminsAboutDocumentRegeneration(userId: string, changedByUserId: string): Promise<void> {
  try {
    // Получаем информацию о пользователе
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!user) {
      console.warn("[profile] Пользователь не найден для уведомления:", userId);
      return;
    }

    // Получаем всех супер админов
    const superAdmins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (superAdmins.length === 0) {
      console.warn("[profile] Супер админы не найдены");
      return;
    }

    const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Пользователь";
    const adminUserIds = superAdmins.map(admin => admin.id);

    // Отправляем уведомления
    await sendMassNotification({
      userIds: adminUserIds,
      title: "⚠️ Требуется перегенерация документов",
      body: `Пользователь ${userName} изменил данные профиля после генерации документов. Требуется перегенерация документов.`,
      url: `/admin/users/${userId}`,
      type: "document_regeneration_required",
    });

    console.log(`[profile] Уведомление о перегенерации документов отправлено ${superAdmins.length} супер админам для пользователя ${userId}`);
  } catch (error) {
    console.error("[profile] Ошибка при отправке уведомления супер админам:", error);
    // Не пробрасываем ошибку, чтобы не блокировать обновление профиля
  }
}
