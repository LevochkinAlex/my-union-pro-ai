import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { getDemoProfile } from "@/lib/demo";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { invalidateUsersCache } from "@/lib/cache-invalidation";
import { cacheDeletePattern } from "@/lib/cache";
import { capitalizeName } from "@/lib/utils/nameFormatting";
import { EDUCATION_LEVELS } from "@/lib/constants/education";
import { normalizePhone, getPhoneDigits, isSamePhone } from "@/lib/utils/phone";
import { saveUserProfileToKnowledgeBase } from "@/lib/user-knowledge-base";
import { sendMassNotification } from "@/lib/notifications";
import { withCache, getCacheKey } from "@/lib/cache";
import { isRestrictedJobTitleForSelfService } from "@/lib/dictionaries";
import { findPPOsByWorkplace } from "@/lib/workplace-ppo-mapping";
import { scheduleSyncBestBenefitsIfEligible } from "@/lib/best-benefits-sync-eligible";
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

    const isDemo = session.user.id === DEMO_USER_ID || session.user.id === DEMO_MEMBER_USER_ID;
    if (isDemo) {
      const { user, viewMode, isPPOHead } = getDemoProfile(session.user.id);
      return NextResponse.json({ user, viewMode, isPPOHead });
    }

    console.log("[profile] GET: Fetching user data for ID:", session.user.id);

    const profileSelectBase = {
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
      unionMembershipStatus: true,
      organizationId: true,
      organizationName: true,
      profileChangedAfterDocuments: true,
      profileLastModified: true,
      viewMode: true,
      isPPOHead: true,
      createdAt: true,
      updatedAt: true,
      bestBenefitsUserId: true,
      organization: {
        select: { id: true, name: true, inn: true },
      },
    } as const;

    const cacheKey = getCacheKey("profile", { userId: session.user.id });

    type UserWithProfile = { [key: string]: unknown; organization?: { id: string; name: string; inn: string } | null; subscriptionBlockedAt?: Date | null; role?: string | null };
    let user: UserWithProfile | null = null;

    try {
      user = (await withCache(
        cacheKey,
        async () => {
          return await withPrismaRetry(async () => {
            return await prisma.user.findUnique({
              where: { id: session.user.id },
              select: { ...profileSelectBase, subscriptionBlockedAt: true, role: true },
            });
          });
        },
        10
      )) as UserWithProfile | null;
    } catch (profileError: unknown) {
      const err = profileError as { message?: string; code?: string };
      const isMissingColumn =
        err?.message?.includes("subscriptionBlockedAt") ||
        err?.message?.includes("Unknown column") ||
        err?.message?.includes("does not exist") ||
        err?.code === "P2010";
      if (isMissingColumn) {
        console.warn("[profile] GET: subscription columns missing, using fallback (run migration)");
        user = (await withPrismaRetry(async () => {
          return await prisma.user.findUnique({
            where: { id: session.user.id },
            select: profileSelectBase,
          });
        })) as UserWithProfile | null;
        if (user) {
          (user as { subscriptionBlockedAt?: null; role?: string }).subscriptionBlockedAt = null;
          (user as { role?: string }).role = (session.user as { role?: string })?.role ?? null;
        }
      } else {
        throw profileError;
      }
    }

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
        unionMembershipStatus: user.unionMembershipStatus, // Статус членства в профсоюзе (ACCEPTED, NOT_ACCEPTED и т.д.)
        subscriptionBlockedAt: user.subscriptionBlockedAt ? (user.subscriptionBlockedAt as Date).toISOString() : null,
        organizationId: user.organizationId, // Добавляем organizationId для удобства
        organization: user.organization,
        profileChangedAfterDocuments: user.profileChangedAfterDocuments,
        profileLastModified: user.profileLastModified,
        role: user.role,
        viewMode: user.viewMode, // Режим просмотра для председателей/сотрудников
        isPPOHead: user.isPPOHead, // Флаг председателя ППО
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        /** Есть ли связка с BestBenefits (активация промокодов у партнёров) */
        bestBenefitsLinked: Boolean(user.bestBenefitsUserId),
      },
      // Дублируем viewMode и isPPOHead в корень ответа для удобства
      viewMode: user.viewMode,
      isPPOHead: user.isPPOHead,
    });
  } catch (error: any) {
    console.error("[profile] GET error:", error);
    
    // Проверяем, является ли это ошибкой подключения к БД
    const isConnectionError = 
      error?.code === 'P1001' || // Can't reach database server
      error?.code === 'P1002' || // Database server doesn't accept connections
      error?.code === 'P1008' || // Operations timed out
      error?.code === 'P1017' || // Server has closed the connection
      error?.message?.includes('timeout') ||
      error?.message?.includes('ECONNREFUSED');
    
    if (isConnectionError) {
      return NextResponse.json(
        { error: "Сервис временно недоступен. Попробуйте позже." },
        { status: 503 },
      );
    }
    
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

    const isDemo = session.user.id === DEMO_USER_ID || session.user.id === DEMO_MEMBER_USER_ID;
    if (isDemo) {
      const { user } = getDemoProfile(session.user.id);
      return NextResponse.json({ success: true, user });
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
    
    // ВАЖНО: organizationId обрабатываем отдельно, чтобы различать:
    // - undefined: поле не передано (не трогаем текущее значение)
    // - "" (пустая строка): явно очистили организацию (устанавливаем null)
    // - непустая строка: установили новую организацию
    const organizationId = body.organizationId === undefined 
      ? undefined  // Не трогаем
      : (typeof body.organizationId === "string" && body.organizationId.trim() !== "" 
          ? body.organizationId.trim() 
          : null);  // Пустая строка -> null (явная очистка)

    // Валидация организации, если указана (только ППО — членом можно быть только первичной организации)
    if (organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, type: true, isActive: true },
      });
      if (!org) {
        console.warn("[profile] Organization not found:", organizationId);
        return NextResponse.json(
          { error: `Организация с ID ${organizationId} не найдена. Пожалуйста, выберите организацию из списка.` },
          { status: 400 }
        );
      }
      if (org.type !== "PRIMARY") {
        return NextResponse.json(
          { error: "Членом профсоюза можно быть только в первичной организации (ППО). Выберите ППО из списка." },
          { status: 400 }
        );
      }
      if (!org.isActive) {
        return NextResponse.json(
          { error: "Выбранная организация неактивна. Выберите другую организацию." },
          { status: 400 }
        );
      }
      console.log("[profile] Validating organization:", { id: org.id, name: org.name, type: org.type });
    }

    let dateOfBirth: Date | null = null;
    if (body.dateOfBirth) {
      const dateStr = String(body.dateOfBirth).trim();
      const parts = dateStr.split("-");
      // Парсим YYYY-MM-DD без таймзон (new Date("1992-01-01") даёт UTC полночь и может давать ложные срабатывания)
      const date = parts.length === 3
        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
        : new Date(body.dateOfBirth);
      if (!Number.isNaN(date.getTime())) {
        const year = date.getFullYear();
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (year < 1900 || year > 2100) {
          return NextResponse.json(
            { error: "Год рождения должен быть в диапазоне 1900–2100" },
            { status: 400 }
          );
        }
        if (date > todayStart) {
          return NextResponse.json(
            { error: "Дата рождения не может быть в будущем" },
            { status: 400 }
          );
        }
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
        isPPOHead: true,
        ppoHeadOrganizationId: true,
        membershipStatus: true,
        unionMembershipStatus: true,
        profileChangedAfterDocuments: true, // Нужен для проверки изменения флага
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    let effectiveOrganizationId = organizationId;
    const effectiveWorkplace = workplace ?? userBeforeUpdate?.workplace ?? null;
    const effectiveWorkplaceInn = workplaceInn ?? userBeforeUpdate?.workplaceInn ?? null;

    // Запрещаем сохранять произвольное место работы: ППО должна определяться через справочник привязок.
    if (effectiveWorkplace && effectiveWorkplaceInn) {
      const ppoOptions = await findPPOsByWorkplace(effectiveWorkplace, effectiveWorkplaceInn);
      if (ppoOptions.length === 0) {
        return NextResponse.json(
          {
            error:
              "Для выбранного места работы не найдена привязанная ППО в справочнике. Выберите место работы из привязанных или обратитесь к администратору.",
          },
          { status: 400 }
        );
      }

      const currentOrRequestedOrganizationId =
        effectiveOrganizationId !== undefined
          ? effectiveOrganizationId
          : (userBeforeUpdate?.organizationId ?? null);

      if (!currentOrRequestedOrganizationId) {
        if (ppoOptions.length === 1) {
          effectiveOrganizationId = ppoOptions[0].id;
        } else {
          return NextResponse.json(
            {
              error:
                "Для данного места работы найдено несколько ППО. Выберите организацию профсоюза из списка.",
            },
            { status: 400 }
          );
        }
      } else if (!ppoOptions.some((p) => p.id === currentOrRequestedOrganizationId)) {
        return NextResponse.json(
          {
            error:
              "Выбранная организация профсоюза не привязана к указанному месту работы. Выберите ППО из справочника.",
          },
          { status: 400 }
        );
      }
    }

    // Председатель ППО не может быть членом другой организации.
    if (userBeforeUpdate?.isPPOHead && userBeforeUpdate?.ppoHeadOrganizationId) {
      if (effectiveOrganizationId === null) {
        return NextResponse.json(
          { error: "Председатель ППО не может очистить организацию в профиле. Сначала снимите роль председателя." },
          { status: 400 }
        );
      }
      if (
        effectiveOrganizationId !== undefined &&
        effectiveOrganizationId !== userBeforeUpdate.ppoHeadOrganizationId
      ) {
        return NextResponse.json(
          { error: "Председатель ППО должен состоять в той же организации, где назначен председателем." },
          { status: 400 }
        );
      }
    }

    if (
      isRestrictedJobTitleForSelfService(jobTitle) &&
      normalizeString(userBeforeUpdate?.jobTitle) !== jobTitle
    ) {
      return NextResponse.json(
        { error: "Должность председателя назначается только через РПО" },
        { status: 400 }
      );
    }

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
            error: "Этот номер телефона уже используется другим аккаунтом. Объедините аккаунты в настройках или обратитесь в поддержку.",
            code: "PHONE_ALREADY_USED",
            existingUserId: existingUserWithPhone.id,
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
    const actualOrganizationId = effectiveOrganizationId !== undefined 
      ? effectiveOrganizationId  // null или непустая строка
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
      organizationId: actualOrganizationId || null,
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
    
    // organizationId обновляем при явной передаче ИЛИ при автоподстановке из справочника workplace->PPO.
    const shouldUpdateOrganizationId =
      organizationId !== undefined ||
      String(userBeforeUpdate?.organizationId || "") !== String(actualOrganizationId ?? "");
    if (shouldUpdateOrganizationId) {
      updateData.organizationId = actualOrganizationId; // null или непустая строка
      updateData.organizationName = null; // Очищаем старое текстовое поле (теперь используем только ID)
      // Исключённый сменил организацию — переводим в «ожидает одобрения», как при первой подаче
      const isExcluded = userBeforeUpdate?.membershipStatus === "EXCLUDED" || userBeforeUpdate?.unionMembershipStatus === "REMOVED";
      const orgChanged = String(userBeforeUpdate?.organizationId || "") !== String(actualOrganizationId ?? "");
      if (isExcluded && orgChanged) {
        updateData.membershipStatus = "PROFILE_INCOMPLETE";
        updateData.unionMembershipStatus = "NOT_ACCEPTED";
      }
    }
    
    // Устанавливаем флаг изменения профиля, если есть документы и данные изменились
    const wasProfileChangedAfterDocuments = userBeforeUpdate?.profileChangedAfterDocuments || false;
    
    if (hasGeneratedDocuments && hasProfileChanges) {
      updateData.profileChangedAfterDocuments = true;
    }
    if (hasProfileChanges) {
      updateData.profileLastModified = new Date();
    }

    // Обработка статуса действующего члена (документы на бумаге у председателя)
    if (body.isExistingMember !== undefined) {
      updateData.isExistingMember = body.isExistingMember;
    }
    
    // Обновление статуса членства (если передан)
    if (body.membershipStatus !== undefined) {
      updateData.membershipStatus = body.membershipStatus;
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

    // Повторная попытка BB: если email уже подтверждён, а ФИО только что дописали — раньше sync не вызывался
    scheduleSyncBestBenefitsIfEligible(session.user.id, "profile-put");

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
        status: { in: ["GENERATED", "SIGNED", "PENDING_REVIEW", "PENDING_APPROVAL", "PENDING_SIGNATURE", "COMPLETED"] },
      },
    }) > 0;

    // Удалено: отправка системных сообщений в чат - больше не используется
    if (isProfileComplete && !hasGeneratedDocs) {
      console.log("[profile] Profile completed, ready for document generation");
    }

    // Инвалидируем кеш пользователей и профиля (профиль мог измениться)
    await invalidateUsersCache();
    await cacheDeletePattern(`profile:userId:${session.user.id}:*`);

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
