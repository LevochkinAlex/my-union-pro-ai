import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import YandexProvider from "next-auth/providers/yandex";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "./demo-constants";
import { translitLatinToCyrillic } from "./translit-latin-to-cyrillic";
import { mergeUsers } from "./account-merge";

/**
 * Нормализация номера телефона к формату +7XXXXXXXXXX
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("8")) {
    cleaned = "+7" + cleaned.slice(1);
  }
  if (cleaned.startsWith("7") && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

function copyHeadFlagsFromToken(session: { user: Record<string, unknown> }, t: Record<string, unknown>) {
  (session.user as any).viewMode = t.viewMode ?? "MEMBER";
  (session.user as any).isPPOHead = t.isPPOHead ?? false;
  (session.user as any).ppoHeadOrganizationId = t.ppoHeadOrganizationId ?? null;
  (session.user as any).isMPOHead = t.isMPOHead ?? false;
  (session.user as any).mpoHeadOrganizationId = t.mpoHeadOrganizationId ?? null;
  (session.user as any).isRPOHead = t.isRPOHead ?? false;
  (session.user as any).rpoHeadOrganizationId = t.rpoHeadOrganizationId ?? null;
}

/**
 * Парсинг ФИО из данных Яндекс API.
 * ВАЖНО: firstName = имя (given name), lastName = фамилия (surname). Не менять местами.
 * Яндекс отдаёт first_name = имя, last_name = фамилия — используем как есть.
 * ФИО латиницей транслитерируем в кириллицу для профиля и анкет.
 */
function parseYandexName(yandexUserInfo: {
  first_name?: string;
  last_name?: string;
  real_name?: string;
}): { firstName?: string; lastName?: string; middleName?: string } {
  const result: { firstName?: string; lastName?: string; middleName?: string } = {};

  // Приоритет: first_name и last_name из API (имя и фамилия соответственно — без перестановки)
  if (yandexUserInfo.first_name || yandexUserInfo.last_name) {
    if (yandexUserInfo.first_name) {
      result.firstName = translitLatinToCyrillic(yandexUserInfo.first_name.trim());
    }
    if (yandexUserInfo.last_name) {
      result.lastName = translitLatinToCyrillic(yandexUserInfo.last_name.trim());
    }
    return result;
  }

  // Fallback: парсим real_name (полная строка "Имя Фамилия" или "Фамилия Имя Отчество")
  if (yandexUserInfo.real_name) {
    const realName = translitLatinToCyrillic(yandexUserInfo.real_name.trim());
    const nameParts = realName.split(/\s+/).filter(p => p.length > 0);

    if (nameParts.length >= 2) {
      const firstPart = nameParts[0];
      const secondPart = nameParts[1];
      // Окончания фамилий (целые суффиксы), чтобы не путать с именами: "Иван" не должен считаться фамилией
      const surnameEndings = /(ов|ова|ев|ева|ин|ина|ын|ына|ий|ая|ский|ская|цкий|цкая)$/i;
      const isLikelySurnameFirst =
        firstPart.length > secondPart.length ||
        surnameEndings.test(firstPart);

      if (isLikelySurnameFirst) {
        // Формат: "Фамилия Имя [Отчество]"
        result.lastName = firstPart;
        result.firstName = secondPart;
        if (nameParts.length >= 3) {
          result.middleName = nameParts.slice(2).join(" ");
        }
      } else {
        // Формат: "Имя Фамилия [Отчество]"
        result.firstName = firstPart;
        result.lastName = secondPart;
        if (nameParts.length >= 3) {
          result.middleName = nameParts.slice(2).join(" ");
        }
      }
    } else if (nameParts.length === 1) {
      result.firstName = nameParts[0];
    }
  }

  return result;
}

export const authOptions: NextAuthOptions = {
  providers: [
    // Яндекс ID провайдер
    ...(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET
      ? [
          YandexProvider({
            clientId: process.env.YANDEX_CLIENT_ID,
            clientSecret: process.env.YANDEX_CLIENT_SECRET,
            // Используем дефолтные scope от Яндекс (без явного указания)
          }),
        ]
      : []),
    // Авторизация по временному токену (для MAX, Telegram и др.)
    CredentialsProvider({
      id: "login-token",
      name: "LoginToken",
      credentials: {
        loginToken: { label: "Login Token", type: "text" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.loginToken) {
          return null;
        }

        try {
          // Ищем неиспользованный токен
          const tokenRecord = await prisma.loginToken.findUnique({
            where: { token: credentials.loginToken },
            include: { user: true },
          });

          if (!tokenRecord || tokenRecord.used || tokenRecord.expiresAt < new Date()) {
            return null;
          }

          // Помечаем токен как использованный
          await prisma.loginToken.update({
            where: { id: tokenRecord.id },
            data: {
              used: true,
              usedAt: new Date(),
            },
          });

          // Возвращаем пользователя (firstName/lastName нужны для профиля и сессии)
          const fullName = [tokenRecord.user.firstName, tokenRecord.user.lastName]
            .filter(Boolean)
            .join(" ") || undefined;

          return {
            id: tokenRecord.user.id,
            email: tokenRecord.user.email || undefined,
            name: fullName,
            role: tokenRecord.user.role,
            membershipStatus: tokenRecord.user.membershipStatus,
            firstName: tokenRecord.user.firstName ?? undefined,
            lastName: tokenRecord.user.lastName ?? undefined,
          };
        } catch (error) {
          console.error("[Auth] Ошибка при авторизации по токену:", error);
          return null;
        }
      },
    }),
    // Авторизация по 6-значному PIN-коду, отправленному на email.
    // Пользователь остаётся в том же окне, куда запросил вход.
    // После 5 неудачных попыток токен сжигается (защита от брутфорса).
    CredentialsProvider({
      id: "email-pin",
      name: "EmailPin",
      credentials: {
        email: { label: "Email", type: "email" },
        pin: { label: "PIN", type: "text" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.pin) {
          return null;
        }

        const email = String(credentials.email).trim().toLowerCase();
        const pin = String(credentials.pin).trim();

        if (!/^\d{6}$/.test(pin)) {
          console.log("[Auth] email-pin: некорректный формат PIN");
          return null;
        }

        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) {
            console.log("[Auth] email-pin: пользователь не найден:", email);
            return null;
          }

          // Берём САМЫЙ последний активный LoginToken с PIN для этого пользователя.
          // Предыдущие коды гасятся при запросе нового PIN (см. send-magic-link),
          // поэтому здесь мы ожидаем максимум один активный токен.
          const tokenRecord = await prisma.loginToken.findFirst({
            where: {
              userId: user.id,
              used: false,
              expiresAt: { gt: new Date() },
              pinHash: { not: null },
            },
            orderBy: { createdAt: "desc" },
          });

          if (!tokenRecord || !tokenRecord.pinHash) {
            console.log("[Auth] email-pin: активный PIN не найден");
            return null;
          }

          if (tokenRecord.attempts >= 5) {
            // Превышен лимит — сжигаем токен, чтобы потребовать новый код.
            await prisma.loginToken.update({
              where: { id: tokenRecord.id },
              data: { used: true, usedAt: new Date() },
            });
            console.log("[Auth] email-pin: превышен лимит попыток, токен сожжён");
            return null;
          }

          const ok = await bcrypt.compare(pin, tokenRecord.pinHash);
          if (!ok) {
            await prisma.loginToken.update({
              where: { id: tokenRecord.id },
              data: { attempts: { increment: 1 } },
            });
            console.log("[Auth] email-pin: неверный PIN, attempts=", tokenRecord.attempts + 1);
            return null;
          }

          // Успешно — помечаем использованным и возвращаем пользователя.
          await prisma.loginToken.update({
            where: { id: tokenRecord.id },
            data: { used: true, usedAt: new Date() },
          });

          const fullName =
            [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;

          return {
            id: user.id,
            email: user.email || undefined,
            name: fullName,
            role: user.role,
            membershipStatus: user.membershipStatus,
            firstName: user.firstName ?? undefined,
            lastName: user.lastName ?? undefined,
            avatarUrl: user.avatarUrl,
          };
        } catch (error) {
          console.error("[Auth] email-pin: ошибка:", error);
          return null;
        }
      },
    }),
    // Email/Password авторизация (для супер-админа и пользователей с паролем)
    CredentialsProvider({
      id: "email-password",
      name: "EmailPassword",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) {
          console.log("[NextAuth] Email/Password: отсутствуют email или password");
          return null;
        }

        try {
          const email = credentials.email.trim().toLowerCase();
          
          // Ищем пользователя по email
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user) {
            console.log("[NextAuth] Email/Password: пользователь не найден:", email);
            return null;
          }

          // Проверяем, что у пользователя есть пароль
          if (!user.password) {
            console.log("[NextAuth] Email/Password: у пользователя нет пароля:", email);
            return null;
          }

          // Проверяем пароль
          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
          
          if (!isPasswordValid) {
            console.log("[NextAuth] Email/Password: неверный пароль для:", email);
            return null;
          }

          console.log("[NextAuth] ✅ Email/Password: успешный вход для:", email, "роль:", user.role);

          // Возвращаем пользователя
          return {
            id: user.id,
            email: user.email || undefined,
            name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || undefined,
            role: user.role,
            membershipStatus: user.membershipStatus,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl,
          };
        } catch (error) {
          console.error("[NextAuth] Email/Password: ошибка при авторизации:", error);
          return null;
        }
      },
    }),
    // SMS-авторизация (основной метод)
    CredentialsProvider({
      id: "sms",
      name: "SMS",
      credentials: {
        phone: { label: "Phone", type: "text" },
        pinCode: { label: "PIN Code", type: "text" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.phone || !credentials?.pinCode) {
          return null;
        }

        try {
          const normalizedPhone = normalizePhone(credentials.phone);

          // Ищем неиспользованный PIN-код (пробуем разные форматы номера)
          const phoneVariants = normalizedPhone.startsWith("+") 
            ? [
                normalizedPhone,
                normalizedPhone.replace("+", ""),
                normalizedPhone.replace("+7", "7"),
                normalizedPhone.replace("+7", "8"),
              ]
            : [normalizedPhone];
          
          let pinRecord = await prisma.sMSPinCode.findFirst({
            where: {
              OR: phoneVariants.map(phone => ({ phone })),
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
            console.log("[NextAuth] PIN-код не найден для номера:", normalizedPhone, "варианты:", phoneVariants);
            return null;
          }

          // Проверяем PIN-код
          const pinAsString = String(credentials.pinCode).trim();
          const isPinValid = await bcrypt.compare(pinAsString, pinRecord.hashedPin);
          
          if (!isPinValid) {
            console.log("[NextAuth] PIN-код неверный для номера:", normalizedPhone, "введен:", pinAsString);
            return null;
          }
          
          console.log("[NextAuth] ✅ PIN-код верный для номера:", normalizedPhone);

          // Помечаем PIN-код как использованный
          await prisma.sMSPinCode.update({
            where: { id: pinRecord.id },
            data: {
              used: true,
              usedAt: new Date(),
            },
          });

          // Ищем или создаем пользователя (пробуем все варианты номера)
          // Используем те же варианты, что и для поиска PIN-кода
          let user = await prisma.user.findFirst({
            where: {
              OR: [
                ...phoneVariants.map(phone => ({ phone })),
                ...phoneVariants.map(phone => ({ authPhone: phone })),
              ],
            },
          });
          
          if (user && user.phone !== normalizedPhone) {
            // Обновляем телефон на нормализованный формат
            console.log("[NextAuth] 📞 Найден пользователь с другим форматом телефона, обновляем:", {
              oldPhone: user.phone,
              newPhone: normalizedPhone,
            });
            user = await prisma.user.update({
              where: { id: user.id },
              data: { phone: normalizedPhone },
            });
          }

          if (!user) {
            // Создаем нового пользователя при первом успешном входе
            // ВАЖНО: НЕ устанавливаем emailVerified автоматически
            // Валидация email должна происходить в анкете после первого входа
            user = await prisma.user.create({
              data: {
                phone: normalizedPhone,
                authPhone: normalizedPhone, // Устанавливаем authPhone при первой SMS авторизации
                role: "PENDING_MEMBER",
                membershipStatus: "PROFILE_INCOMPLETE",
                emailVerified: null, // Email не верифицирован до подтверждения в анкете
              },
            });
            console.log("[NextAuth] ✅ Создан новый пользователь при первом входе:", {
              id: user.id,
              phone: user.phone,
              authPhone: user.authPhone,
            });
          } else {
            // Если authPhone не установлен, устанавливаем его (для старых пользователей)
            if (!user.authPhone) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { authPhone: normalizedPhone },
              });
              console.log("[NextAuth] 📞 Установлен authPhone для существующего пользователя:", user.id);
            }
            console.log("[NextAuth] ✅ Найден существующий пользователь:", {
              id: user.id,
              phone: user.phone,
              authPhone: user.authPhone,
              role: user.role,
            });
          }

          return {
            id: user.id,
            email: user.email || undefined,
            name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || undefined,
            role: user.role,
            membershipStatus: user.membershipStatus,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl,
          };
        } catch (error) {
          console.error("[NextAuth] SMS Authorize error:", error);
          return null;
        }
      },
    }),
    // Impersonation провайдер (для входа от имени пользователя)
    CredentialsProvider({
      id: "impersonate",
      name: "Impersonate",
      credentials: {
        userId: { label: "User ID", type: "text" },
        originalAdminId: { label: "Original Admin ID", type: "text" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.userId || !credentials?.originalAdminId) {
          return null;
        }

        try {
          // Проверяем, что админ существует и является супер-админом
          const admin = await prisma.user.findUnique({
            where: { id: credentials.originalAdminId },
          });

          if (!admin || admin.role !== "SUPER_ADMIN") {
            return null;
          }

          // Получаем пользователя, от имени которого входим
          const targetUser = await prisma.user.findUnique({
            where: { id: credentials.userId },
          });

          if (!targetUser) {
            return null;
          }

          // Возвращаем пользователя с флагом impersonation
          return {
            id: targetUser.id,
            email: targetUser.email || undefined,
            name: `${targetUser.firstName ?? ""} ${targetUser.lastName ?? ""}`.trim() || undefined,
            role: targetUser.role,
            membershipStatus: targetUser.membershipStatus,
            firstName: targetUser.firstName,
            lastName: targetUser.lastName,
            avatarUrl: targetUser.avatarUrl,
            // Добавляем метаданные для impersonation
            originalAdminId: admin.id,
            isImpersonating: true,
          } as User & { originalAdminId: string; isImpersonating: boolean };
        } catch (error) {
          console.error("[Auth] Impersonate error:", error);
          return null;
        }
      },
    }),
    // Восстановление сессии админа после impersonation
    CredentialsProvider({
      id: "restore-admin",
      name: "Restore Admin",
      credentials: {
        adminId: { label: "Admin ID", type: "text" },
        restoreToken: { label: "Restore Token", type: "text" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.adminId) {
          console.error("[Auth] Restore admin: No adminId provided");
          return null;
        }

        try {
          // Добавляем таймаут для запроса к БД
          const admin = await Promise.race([
            prisma.user.findUnique({
              where: { id: credentials.adminId },
            }),
            new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error("Database query timeout")), 10000)
            )
          ]).catch((error) => {
            console.error("[Auth] Restore admin database error:", error);
            return null;
          }) as Awaited<ReturnType<typeof prisma.user.findUnique>> | null;

          if (!admin) {
            console.error("[Auth] Restore admin: Admin not found");
            return null;
          }

          if (admin.role !== "SUPER_ADMIN") {
            console.error("[Auth] Restore admin: User is not SUPER_ADMIN");
            return null;
          }

          // Возвращаем админа без флагов impersonation
          return {
            id: admin.id,
            email: admin.email || undefined,
            name: `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim() || undefined,
            role: admin.role,
            membershipStatus: admin.membershipStatus,
            firstName: admin.firstName,
            lastName: admin.lastName,
            avatarUrl: admin.avatarUrl,
          };
        } catch (error) {
          console.error("[Auth] Restore admin error:", error);
          return null;
        }
      },
    }),
    // Email/Password авторизация (для обратной совместимости)
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user || !user.password) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email || undefined,
            name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || undefined,
            role: user.role,
            membershipStatus: user.membershipStatus,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl,
          };
        } catch (error) {
          console.error("[NextAuth] Email Authorize error:", error);
          return null;
        }
      },
    }),
    // Демо-режим: вход без БД — председатель (demo=chairman) или член профсоюза (demo=member)
    CredentialsProvider({
      id: "demo",
      name: "Demo",
      credentials: {
        demo: { label: "Demo", type: "text" },
      },
      async authorize(credentials): Promise<User | null> {
        const demo = credentials?.demo;
        if (demo === "chairman" || demo === "true") {
          return {
            id: DEMO_USER_ID,
            email: "demo-chairman@demo.local",
            name: "Иван Еременко",
            role: "PPO_HEAD",
            membershipStatus: "APPROVED",
            firstName: "Иван",
            lastName: "Еременко",
            isDemo: true,
          } as User & { isDemo: boolean };
        }
        if (demo === "member") {
          return {
            id: DEMO_MEMBER_USER_ID,
            email: "demo-member@demo.local",
            name: "Анна Сидорова",
            role: "MEMBER",
            membershipStatus: "APPROVED",
            firstName: "Анна",
            lastName: "Сидорова",
            isDemo: true,
          } as User & { isDemo: boolean };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Обработка входа через Яндекс
      if (account?.provider === "yandex" && account?.access_token) {
        try {
          // Получаем дополнительную информацию от Яндекс API
          const yandexUserInfo = await fetch("https://login.yandex.ru/info?format=json", {
            headers: {
              Authorization: `OAuth ${account.access_token}`,
            },
          }).then((res) => res.json());

          console.log("[Yandex Auth] Получены данные от Яндекс:", {
            id: yandexUserInfo.id,
            email: yandexUserInfo.default_email,
            phone: yandexUserInfo.default_phone?.number,
            name: yandexUserInfo.real_name,
          });

          // Собираем все условия для поиска пользователя
          const searchConditions: any[] = [];

          // Поиск по yandexId (приоритетный)
          if (yandexUserInfo.id) {
            try {
              searchConditions.push({ yandexId: yandexUserInfo.id.toString() });
              console.log("[Yandex Auth] Добавлено условие поиска по yandexId:", yandexUserInfo.id.toString());
            } catch (e) {
              console.log("[Yandex Auth] yandexId поиск пропущен (поле еще не создано)");
            }
          }

          // Поиск по email
          if (yandexUserInfo.default_email) {
            searchConditions.push({ email: yandexUserInfo.default_email });
            console.log("[Yandex Auth] Добавлено условие поиска по email:", yandexUserInfo.default_email);
          }
          if (yandexUserInfo.emails?.[0] && yandexUserInfo.emails[0] !== yandexUserInfo.default_email) {
            searchConditions.push({ email: yandexUserInfo.emails[0] });
            console.log("[Yandex Auth] Добавлено условие поиска по альтернативному email:", yandexUserInfo.emails[0]);
          }

          // Поиск по телефону (все варианты формата)
          if (yandexUserInfo.default_phone?.number) {
            const normalizedPhone = normalizePhone(yandexUserInfo.default_phone.number);
            const phoneVariants = [
              normalizedPhone,
              normalizedPhone.replace("+", ""),
              normalizedPhone.replace("+7", "7"),
              normalizedPhone.replace("+7", "8"),
            ];
            phoneVariants.forEach((p) => {
              searchConditions.push({ phone: p });
              searchConditions.push({ authPhone: p });
            });
            console.log("[Yandex Auth] Добавлено условие поиска по телефону (варианты):", phoneVariants);
          }

          console.log("[Yandex Auth] Всего условий поиска:", searchConditions.length);

          // Ищем всех пользователей, подходящих по любому условию (для слияния дубликатов по email/телефону)
          let existingUser: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;
          if (searchConditions.length > 0) {
            try {
              const candidates = await prisma.user.findMany({
                where: { OR: searchConditions },
                select: { id: true, telegramChatId: true },
              });
              if (candidates.length > 0) {
                // При нескольких аккаунтах (одинаковые email/телефон) — сливаем в один
                const primary = candidates.find((u) => u.telegramChatId != null) ?? candidates[0];
                if (candidates.length > 1) {
                  for (const u of candidates) {
                    if (u.id === primary.id) continue;
                    const { ok, error } = await mergeUsers(prisma, primary.id, u.id);
                    if (!ok) console.warn("[Yandex Auth] Не удалось слить аккаунт:", u.id, error);
                  }
                }
                existingUser = await prisma.user.findUnique({ where: { id: primary.id } });
              }
              console.log("[Yandex Auth] Результат поиска пользователя:", existingUser ? "НАЙДЕН" : "НЕ НАЙДЕН");
            } catch (searchError) {
              console.error("[Yandex Auth] Ошибка при поиске пользователя:", searchError);
            }
          } else {
            console.log("[Yandex Auth] Нет условий для поиска пользователя");
          }

          // Если пользователь существует - обновляем данные (НЕ заменяя существующие email/phone)
          if (existingUser) {
            console.log("[Yandex Auth] Найден существующий пользователь:", {
              id: existingUser.id,
              email: existingUser.email,
              phone: existingUser.phone,
              authPhone: existingUser.authPhone,
            });

            const updateData: any = {};

            // ВАЖНО: НЕ заменяем существующие email и phone, даже если в Яндекс другие
            // Обновляем email ТОЛЬКО если его нет
            if (yandexUserInfo.default_email && !existingUser.email) {
              updateData.email = yandexUserInfo.default_email;
              console.log("[Yandex Auth] Будет установлен email из Яндекс (т.к. отсутствует):", yandexUserInfo.default_email);
            } else if (yandexUserInfo.default_email && existingUser.email && existingUser.email !== yandexUserInfo.default_email) {
              console.log("[Yandex Auth] Email НЕ заменяется (существующий приоритетен):", {
                существующий: existingUser.email,
                изЯндекс: yandexUserInfo.default_email,
              });
            }

            // Обновляем телефон ТОЛЬКО если его нет
            if (yandexUserInfo.default_phone?.number) {
              const normalizedPhone = normalizePhone(yandexUserInfo.default_phone.number);
              if (!existingUser.phone) {
                updateData.phone = normalizedPhone;
                console.log("[Yandex Auth] Будет установлен phone из Яндекс (т.к. отсутствует):", normalizedPhone);
              } else {
                const existingPhoneNormalized = normalizePhone(existingUser.phone);
                if (existingPhoneNormalized !== normalizedPhone) {
                  console.log("[Yandex Auth] Phone НЕ заменяется (существующий приоритетен):", {
                    существующий: existingUser.phone,
                    изЯндекс: normalizedPhone,
                  });
                }
              }
              // Обновляем authPhone ТОЛЬКО если его нет
              if (!existingUser.authPhone) {
                updateData.authPhone = normalizedPhone;
                console.log("[Yandex Auth] Будет установлен authPhone из Яндекс (т.к. отсутствует):", normalizedPhone);
              }
            } else {
              // ВАЖНО: Если в Яндекс нет телефона, но у пользователя есть authPhone, восстанавливаем phone из authPhone
              // Это защита от потери данных, если phone был случайно установлен в null
              if (!existingUser.phone && existingUser.authPhone) {
                updateData.phone = existingUser.authPhone;
                console.log("[Yandex Auth] Восстанавливаем phone из authPhone (защита от потери данных):", existingUser.authPhone);
              }
            }

            // Обновляем имя и фамилию, если их нет
            // ВАЖНО: НЕ перезаписываем существующие данные
            const parsedName = parseYandexName(yandexUserInfo);
            if (!existingUser.firstName && parsedName.firstName) {
              updateData.firstName = parsedName.firstName;
            }
            if (!existingUser.lastName && parsedName.lastName) {
              updateData.lastName = parsedName.lastName;
            }
            if (!existingUser.middleName && parsedName.middleName) {
              updateData.middleName = parsedName.middleName;
            }

            // Обновляем аватар, если его нет
            if (yandexUserInfo.default_avatar_id && !existingUser.avatarUrl) {
              updateData.avatarUrl = `https://avatars.yandex.net/get-yapic/${yandexUserInfo.default_avatar_id}/islands-200`;
            }

            // Сохраняем Yandex ID для связи (всегда обновляем, если есть)
            if (yandexUserInfo.id) {
              updateData.yandexId = yandexUserInfo.id.toString();
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.user.update({
                where: { id: existingUser.id },
                data: updateData,
              });
              console.log("[Yandex Auth] Обновлены данные пользователя:", existingUser.id, updateData);
            } else {
              console.log("[Yandex Auth] Данные пользователя не требуют обновления");
            }

            // Обновляем user объект для NextAuth (используем существующие данные, не из Яндекс)
            // Нужно получить актуальные данные из БД после обновления
            const updatedUser = await prisma.user.findUnique({
              where: { id: existingUser.id },
            });
            
            if (updatedUser) {
              user.id = updatedUser.id;
              user.email = updatedUser.email || undefined;
              user.name = updatedUser.firstName && updatedUser.lastName
                ? `${updatedUser.firstName} ${updatedUser.lastName}`
                : yandexUserInfo.real_name || yandexUserInfo.display_name || undefined;
              (user as any).role = updatedUser.role;
              (user as any).membershipStatus = updatedUser.membershipStatus;
              (user as any).firstName = updatedUser.firstName;
              (user as any).lastName = updatedUser.lastName;
              (user as any).avatarUrl = updatedUser.avatarUrl;
              (user as any).yandexId = (updatedUser as any).yandexId;
              console.log("[Yandex Auth] User объект обновлен для NextAuth:", {
                id: user.id,
                email: user.email,
                phone: updatedUser.phone,
                authPhone: updatedUser.authPhone,
                role: (user as any).role,
              });
            } else {
              // Fallback на existingUser, если не удалось получить обновленные данные
              user.id = existingUser.id;
              user.email = existingUser.email || undefined;
              user.name = existingUser.firstName && existingUser.lastName
                ? `${existingUser.firstName} ${existingUser.lastName}`
                : yandexUserInfo.real_name || yandexUserInfo.display_name || undefined;
              (user as any).role = existingUser.role;
              (user as any).membershipStatus = existingUser.membershipStatus;
              (user as any).firstName = existingUser.firstName;
              (user as any).lastName = existingUser.lastName;
              (user as any).avatarUrl = existingUser.avatarUrl;
            }
          } else {
            // Email/телефон не нашли — проверяем: может, аккаунт с этим email уже есть (например, заходил по СМС и верифицировал почту)
            const existingByEmail =
              yandexUserInfo.default_email
                ? await prisma.user.findFirst({
                    where: {
                      email: { equals: yandexUserInfo.default_email.trim().toLowerCase(), mode: "insensitive" },
                    },
                  })
                : null;

            if (existingByEmail) {
              console.log("[Yandex Auth] Найден аккаунт по email — привязываем Яндекс к существующему пользователю:", existingByEmail.id);
              const updateData: any = { yandexId: yandexUserInfo.id ? yandexUserInfo.id.toString() : undefined };
              if (!existingByEmail.firstName || !existingByEmail.lastName) {
                const parsedName = parseYandexName(yandexUserInfo);
                if (parsedName.firstName && !existingByEmail.firstName) updateData.firstName = parsedName.firstName;
                if (parsedName.lastName && !existingByEmail.lastName) updateData.lastName = parsedName.lastName;
                if (parsedName.middleName && !existingByEmail.middleName) updateData.middleName = parsedName.middleName;
              }
              if (yandexUserInfo.default_avatar_id && !existingByEmail.avatarUrl) {
                updateData.avatarUrl = `https://avatars.yandex.net/get-yapic/${yandexUserInfo.default_avatar_id}/islands-200`;
              }
              if (Object.keys(updateData).length > 0) {
                await prisma.user.update({ where: { id: existingByEmail.id }, data: updateData });
              }
              const updated = await prisma.user.findUnique({ where: { id: existingByEmail.id } });
              if (updated) {
                user.id = updated.id;
                user.email = updated.email || undefined;
                user.name = updated.firstName && updated.lastName
                  ? `${updated.firstName} ${updated.lastName}`
                  : yandexUserInfo.real_name || yandexUserInfo.display_name || undefined;
                (user as any).role = updated.role;
                (user as any).membershipStatus = updated.membershipStatus;
                (user as any).firstName = updated.firstName;
                (user as any).lastName = updated.lastName;
                (user as any).avatarUrl = updated.avatarUrl;
              }
            } else {
              // Создаем нового пользователя (если авторизовался через Яндекс первым)
              console.log("[Yandex Auth] Пользователь не найден, создаем нового");

              const normalizedPhone = yandexUserInfo.default_phone?.number
                ? normalizePhone(yandexUserInfo.default_phone.number)
                : null;

              const newUserData: any = {
                email: yandexUserInfo.default_email || null,
                phone: normalizedPhone,
                authPhone: normalizedPhone,
                role: "PENDING_MEMBER",
                membershipStatus: "PROFILE_INCOMPLETE",
              };

              const parsedName = parseYandexName(yandexUserInfo);
              if (parsedName.firstName) newUserData.firstName = parsedName.firstName;
              if (parsedName.lastName) newUserData.lastName = parsedName.lastName;
              if (parsedName.middleName) newUserData.middleName = parsedName.middleName;
              if (yandexUserInfo.default_avatar_id) {
                newUserData.avatarUrl = `https://avatars.yandex.net/get-yapic/${yandexUserInfo.default_avatar_id}/islands-200`;
              }
              if (yandexUserInfo.id) newUserData.yandexId = yandexUserInfo.id.toString();

              const newUser = await prisma.user.create({
                data: newUserData,
              });

              console.log("[Yandex Auth] Создан новый пользователь:", newUser.id);

              user.id = newUser.id;
              user.email = newUser.email || undefined;
              user.name = newUser.firstName && newUser.lastName
                ? `${newUser.firstName} ${newUser.lastName}`
                : yandexUserInfo.real_name || yandexUserInfo.display_name || undefined;
            }
          }
        } catch (error) {
          console.error("[Yandex Auth] Ошибка при обработке входа:", error);
          return false; // Отклоняем вход при ошибке
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // Храним только минимально необходимые данные для уменьшения размера JWT токена
        token.id = user.id;
        token.role = user.role;
        token.membershipStatus = user.membershipStatus;
        // Ограничиваем длину строковых полей и не храним undefined/null
        token.firstName = user.firstName && user.firstName.length > 0 ? user.firstName.substring(0, 50) : undefined;
        token.lastName = user.lastName && user.lastName.length > 0 ? user.lastName.substring(0, 50) : undefined;
        // Не храним avatarUrl в токене (слишком длинный URL) - будем получать из БД при необходимости
        token.email = user.email && user.email.length > 0 ? user.email.substring(0, 100) : undefined;
        // Не храним name (можно вычислить из firstName + lastName)
        // Копируем поля impersonation из объекта пользователя в токен
        // ВАЖНО: Явно очищаем поля, если их нет в объекте пользователя
        if ('originalAdminId' in user && user.originalAdminId) {
          token.originalAdminId = user.originalAdminId as string;
        } else {
          token.originalAdminId = undefined;
        }
        if ('isImpersonating' in user && user.isImpersonating) {
          token.isImpersonating = user.isImpersonating as boolean;
        } else {
          token.isImpersonating = undefined;
        }
        // Демо-режим: не обращаемся к БД
        if ('isDemo' in user && user.isDemo) {
          token.isDemo = true;
        } else {
          token.isDemo = undefined;
        }
        // При логине подтягиваем viewMode и флаги РПО/ППО/МПО в токен (fallback на проде при таймауте БД в session)
        if (user?.id && process.env.DATABASE_URL) {
          try {
            const u = await prisma.user.findUnique({
              where: { id: user.id as string },
              select: {
                viewMode: true,
                isPPOHead: true,
                ppoHeadOrganizationId: true,
                isMPOHead: true,
                mpoHeadOrganizationId: true,
                isRPOHead: true,
                rpoHeadOrganizationId: true,
              },
            });
            if (u) {
              (token as any).viewMode = u.viewMode ?? "MEMBER";
              (token as any).isPPOHead = u.isPPOHead ?? false;
              (token as any).ppoHeadOrganizationId = u.ppoHeadOrganizationId ?? null;
              (token as any).isMPOHead = u.isMPOHead ?? false;
              (token as any).mpoHeadOrganizationId = u.mpoHeadOrganizationId ?? null;
              (token as any).isRPOHead = u.isRPOHead ?? false;
              (token as any).rpoHeadOrganizationId = u.rpoHeadOrganizationId ?? null;
            }
          } catch (_) {
            // при ошибке оставляем токен без изменений
          }
        }
      }
      
      // Демо-пользователь: не обновляем из БД
      if (token.id === DEMO_USER_ID || token.id === DEMO_MEMBER_USER_ID || token.isDemo) {
        return token;
      }
      
      // Если это вход через Яндекс, получаем актуальные данные пользователя
      if (account?.provider === "yandex" && token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              role: true,
              membershipStatus: true,
            },
          });

          if (dbUser) {
            token.id = dbUser.id;
            token.email = dbUser.email && dbUser.email.length > 0 ? dbUser.email.substring(0, 100) : undefined;
            // Не храним name (можно вычислить из firstName + lastName)
            token.firstName = dbUser.firstName && dbUser.firstName.length > 0 ? dbUser.firstName.substring(0, 50) : undefined;
            token.lastName = dbUser.lastName && dbUser.lastName.length > 0 ? dbUser.lastName.substring(0, 50) : undefined;
            // Не храним avatarUrl в токене (слишком длинный URL)
            token.role = dbUser.role;
            token.membershipStatus = dbUser.membershipStatus;
          }
        } catch (error) {
          console.error("[Yandex Auth] Ошибка при обновлении токена:", error);
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        // Временно используем значения из токена (fallback)
        session.user.role = token.role;
        session.user.membershipStatus = token.membershipStatus;
        session.user.firstName = token.firstName;
        session.user.lastName = token.lastName;
        // Имя для отображения: из токена (firstName + lastName) или оставляем текущее
        const fullName = [token.firstName, token.lastName].filter(Boolean).join(" ").trim();
        if (fullName) session.user.name = fullName;
        // avatarUrl не хранится в токене (слишком длинный URL), будет получаться из БД при необходимости
        session.user.avatarUrl = undefined;
        
        // Демо-режим: не обращаемся к БД (member checked first — token.isDemo is true for both)
        if (token.id === DEMO_MEMBER_USER_ID) {
          (session.user as any).viewMode = "MEMBER";
          (session.user as any).isPPOHead = false;
          (session.user as any).ppoHeadOrganizationId = null;
          (session.user as any).isDemo = true;
          session.user.firstName = token.firstName || "Анна";
          session.user.lastName = token.lastName || "Сидорова";
          session.user.name = [session.user.firstName, session.user.lastName].filter(Boolean).join(" ").trim() || "Анна Сидорова";
        } else if (token.id === DEMO_USER_ID || token.isDemo) {
          (session.user as any).viewMode = "PPO_HEAD";
          (session.user as any).isPPOHead = true;
          (session.user as any).ppoHeadOrganizationId = null;
          (session.user as any).isDemo = true;
        } else {
          // Получаем актуальные данные из БД при каждом запросе; при ошибке/таймауте — fallback из токена (на проде не теряем РПО)
          const userId = typeof token.id === "string" && token.id.trim() ? token.id.trim() : null;
          const t = token as any;
          if (userId && process.env.DATABASE_URL) {
            try {
              const AUTH_SESSION_DB_MS = 4000;
              const dbPromise = prisma.user.findUnique({
                where: { id: userId },
                select: {
                  role: true,
                  membershipStatus: true,
                  viewMode: true,
                  isPPOHead: true,
                  ppoHeadOrganizationId: true,
                  isMPOHead: true,
                  mpoHeadOrganizationId: true,
                  isRPOHead: true,
                  rpoHeadOrganizationId: true,
                  firstName: true,
                  lastName: true,
                },
              });
              const timeoutPromise = new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), AUTH_SESSION_DB_MS)
              );
              const userData = await Promise.race([dbPromise, timeoutPromise]);
              if (userData) {
                session.user.role = userData.role;
                session.user.membershipStatus = userData.membershipStatus;
                (session.user as any).viewMode = userData.viewMode || "MEMBER";
                (session.user as any).isPPOHead = userData.isPPOHead || false;
                (session.user as any).ppoHeadOrganizationId = userData.ppoHeadOrganizationId ?? null;
                (session.user as any).isMPOHead = userData.isMPOHead || false;
                (session.user as any).mpoHeadOrganizationId = userData.mpoHeadOrganizationId ?? null;
                (session.user as any).isRPOHead = userData.isRPOHead || false;
                (session.user as any).rpoHeadOrganizationId = userData.rpoHeadOrganizationId ?? null;
                if (userData.firstName != null) session.user.firstName = userData.firstName;
                if (userData.lastName != null) session.user.lastName = userData.lastName;
                const fullNameFromDb = [userData.firstName, userData.lastName].filter(Boolean).join(" ").trim();
                if (fullNameFromDb) session.user.name = fullNameFromDb;
              } else {
                copyHeadFlagsFromToken(session, t);
              }
            } catch (error) {
              console.error("[Auth] Error fetching user data from DB:", error);
              copyHeadFlagsFromToken(session, t);
            }
          } else {
            copyHeadFlagsFromToken(session, t);
          }
        }
        
        // Копируем поля impersonation из токена в сессию
        // ВАЖНО: Явно очищаем поля, если их нет в токене
        if (token.originalAdminId) {
          (session.user as any).originalAdminId = token.originalAdminId;
        } else {
          (session.user as any).originalAdminId = undefined;
        }
        if (token.isImpersonating !== undefined) {
          (session.user as any).isImpersonating = token.isImpersonating;
        } else {
          (session.user as any).isImpersonating = undefined;
        }
        
        // Добавляем accessToken для WebSocket аутентификации
        // Используем JWT токен из NextAuth
        (session as any).accessToken = token.sub ? 
          require('jsonwebtoken').sign(
            { sub: token.id, name: `${token.firstName || ''} ${token.lastName || ''}`.trim() },
            process.env.NEXTAUTH_SECRET || '',
            { expiresIn: '7d' }
          ) : undefined;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Если URL начинается с baseUrl, возвращаем его как есть
      if (url.startsWith(baseUrl)) {
        return url;
      }
      // Если URL начинается с "/", добавляем baseUrl
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      // По умолчанию редиректим на baseUrl
      return baseUrl;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
  // В продакшене за реверс-прокси: доверять Host из запроса (в типах NextAuth 4.24 нет, на runtime работает)
  // @ts-expect-error - trustHost supported at runtime
  trustHost: true,
};

// Логирование конфигурации при загрузке модуля
if (process.env.NODE_ENV === "development") {
  console.log("[NextAuth] Config:", {
    hasSecret: !!process.env.NEXTAUTH_SECRET,
    nextAuthUrl: process.env.NEXTAUTH_URL,
    secretLength: process.env.NEXTAUTH_SECRET?.length || 0,
  });
  
  if (!process.env.NEXTAUTH_URL) {
    console.warn("[NextAuth] WARNING: NEXTAUTH_URL is not set!");
  }
  if (!process.env.NEXTAUTH_SECRET) {
    console.warn("[NextAuth] WARNING: NEXTAUTH_SECRET is not set!");
  }
}