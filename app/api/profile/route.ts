import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { capitalizeName } from "@/lib/utils/nameFormatting";
import { EDUCATION_LEVELS } from "@/lib/constants/education";
import { normalizePhone, getPhoneDigits, isSamePhone } from "@/lib/utils/phone";
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
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
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
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

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
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();

    const firstName = normalizeString(body.firstName);
    const lastName = normalizeString(body.lastName);
    const middleName = normalizeString(body.middleName);
    const email = normalizeString(body.email);
    const phone = normalizeString(body.phone);
    const address = normalizeString(body.address);
    const preferredDiscountCity = normalizeString(body.preferredDiscountCity);
    const jobTitle = normalizeString(body.jobTitle);
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
        profession: true,
        education: true,
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

    // Проверяем, изменились ли ключевые поля профиля, которые влияют на документы
    const documentsAffectingFields = [
      { old: userBeforeUpdate?.firstName, new: firstName ? capitalizeName(firstName) : null },
      { old: userBeforeUpdate?.lastName, new: lastName ? capitalizeName(lastName) : null },
      { old: userBeforeUpdate?.middleName, new: middleName ? capitalizeName(middleName) : null },
      { old: userBeforeUpdate?.dateOfBirth?.toISOString(), new: dateOfBirth?.toISOString() },
      { old: normalizePhone(userBeforeUpdate?.phone), new: normalizedPhone },
      { old: userBeforeUpdate?.address, new: address },
      { old: userBeforeUpdate?.jobTitle, new: jobTitle },
      { old: userBeforeUpdate?.profession, new: profession },
      { old: userBeforeUpdate?.education, new: education },
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

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        firstName: firstName ? capitalizeName(firstName) : null,
        lastName: lastName ? capitalizeName(lastName) : null,
        middleName: middleName ? capitalizeName(middleName) : null,
        email: emailToSave, // Email не меняется если уже установлен
        phone: normalizedPhone, // Телефон всегда сохраняется в нормализованном формате
        address,
        preferredDiscountCity: preferredDiscountCity ? capitalizeName(preferredDiscountCity) : null,
        jobTitle,
        profession,
        education,
        dateOfBirth,
        organizationId: organizationId || null, // ID выбранной организации
        organizationName: null, // Очищаем старое текстовое поле (теперь используем только ID)
        // Устанавливаем флаг изменения профиля, если есть документы и данные изменились
        profileChangedAfterDocuments: hasGeneratedDocuments && hasProfileChanges ? true : undefined,
        profileLastModified: hasProfileChanges ? new Date() : undefined,
      },
    });

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
