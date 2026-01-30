import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import YandexProvider from "next-auth/providers/yandex";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "./demo-constants";

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

/**
 * Парсинг ФИО из данных Яндекс API
 * Приоритет: first_name/last_name > real_name (с умным парсингом)
 */
function parseYandexName(yandexUserInfo: {
  first_name?: string;
  last_name?: string;
  real_name?: string;
}): { firstName?: string; lastName?: string; middleName?: string } {
  const result: { firstName?: string; lastName?: string; middleName?: string } = {};

  // Приоритет: используем first_name и last_name из Yandex API (наиболее надежно)
  if (yandexUserInfo.first_name || yandexUserInfo.last_name) {
    if (yandexUserInfo.first_name) {
      result.firstName = yandexUserInfo.first_name.trim();
    }
    if (yandexUserInfo.last_name) {
      result.lastName = yandexUserInfo.last_name.trim();
    }
    return result;
  }

  // Fallback: парсим real_name
  // Формат может быть: "Фамилия Имя Отчество" или "Имя Фамилия" или другой
  if (yandexUserInfo.real_name) {
    const realName = yandexUserInfo.real_name.trim();
    const nameParts = realName.split(/\s+/).filter(p => p.length > 0);
    
    if (nameParts.length >= 2) {
      // Пробуем определить формат по длине и окончанию
      // Если первое слово длиннее и заканчивается на -ов/-ев/-ин - скорее всего фамилия
      const firstPart = nameParts[0];
      const secondPart = nameParts[1];
      const isLikelySurnameFirst = 
        firstPart.length > secondPart.length ||
        /[-ов|-ев|-ин|-ая|-ий]$/i.test(firstPart);
      
      if (isLikelySurnameFirst) {
        // Формат: "Фамилия Имя Отчество"
        result.lastName = firstPart;
        result.firstName = secondPart;
        if (nameParts.length >= 3) {
          result.middleName = nameParts.slice(2).join(" ");
        }
      } else {
        // Формат: "Имя Фамилия" или другой
        result.firstName = firstPart;
        result.lastName = secondPart;
        if (nameParts.length >= 3) {
          result.middleName = nameParts.slice(2).join(" ");
        }
      }
    } else if (nameParts.length === 1) {
      // Только одно слово - используем как имя
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
    // Авторизация по временному токену (для соцсетей: Telegram, VK, Google)
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
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

          // Возвращаем пользователя
          const fullName = [tokenRecord.user.firstName, tokenRecord.user.lastName]
            .filter(Boolean)
            .join(" ") || undefined;
            
          return {
            id: tokenRecord.user.id,
            email: tokenRecord.user.email || undefined,
            name: fullName,
            role: tokenRecord.user.role,
            membershipStatus: tokenRecord.user.membershipStatus,
          };
        } catch (error) {
          console.error("[Auth] Ошибка при авторизации по токену:", error);
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
                emailVerified: null, // Email не верифицирован до валидации в анкете
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

          // Ищем пользователя по всем условиям одновременно
          let existingUser = null;
          if (searchConditions.length > 0) {
            try {
              existingUser = await prisma.user.findFirst({
                where: {
                  OR: searchConditions,
                },
              });
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
            // Создаем нового пользователя (если авторизовался через Яндекс первым)
            console.log("[Yandex Auth] Пользователь не найден, создаем нового");
            
            const normalizedPhone = yandexUserInfo.default_phone?.number
              ? normalizePhone(yandexUserInfo.default_phone.number)
              : null;

            const newUserData: any = {
              email: yandexUserInfo.default_email || null,
              phone: normalizedPhone,
              authPhone: normalizedPhone, // Устанавливаем authPhone при первой Яндекс авторизации
              role: "PENDING_MEMBER",
              membershipStatus: "PROFILE_INCOMPLETE",
            };

            // Парсим имя из данных Яндекс
            const parsedName = parseYandexName(yandexUserInfo);
            if (parsedName.firstName) {
              newUserData.firstName = parsedName.firstName;
            }
            if (parsedName.lastName) {
              newUserData.lastName = parsedName.lastName;
            }
            if (parsedName.middleName) {
              newUserData.middleName = parsedName.middleName;
            }

            // Аватар
            if (yandexUserInfo.default_avatar_id) {
              newUserData.avatarUrl = `https://avatars.yandex.net/get-yapic/${yandexUserInfo.default_avatar_id}/islands-200`;
            }

            // Yandex ID
            if (yandexUserInfo.id) {
              newUserData.yandexId = yandexUserInfo.id.toString();
            }

            const newUser = await prisma.user.create({
              data: newUserData,
            });

            console.log("[Yandex Auth] Создан новый пользователь:", {
              id: newUser.id,
              email: newUser.email,
              phone: newUser.phone,
              authPhone: newUser.authPhone,
            });
            
            user.id = newUser.id;
            user.email = newUser.email || undefined;
            user.name = newUser.firstName && newUser.lastName
              ? `${newUser.firstName} ${newUser.lastName}`
              : yandexUserInfo.real_name || yandexUserInfo.display_name || undefined;
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
        
        // Демо-режим: не обращаемся к БД
        if (token.id === DEMO_USER_ID || token.isDemo) {
          (session.user as any).viewMode = "PPO_HEAD";
          (session.user as any).isPPOHead = true;
          (session.user as any).ppoHeadOrganizationId = null;
          (session.user as any).isDemo = true;
        } else if (token.id === DEMO_MEMBER_USER_ID) {
          (session.user as any).viewMode = "MEMBER";
          (session.user as any).isPPOHead = false;
          (session.user as any).ppoHeadOrganizationId = null;
          (session.user as any).isDemo = true;
        } else {
          // Получаем актуальные данные из БД при каждом запросе сессии
          try {
            const userData = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: {
                role: true,
                membershipStatus: true,
                viewMode: true,
                isPPOHead: true,
                ppoHeadOrganizationId: true,
              },
            });
            
            if (userData) {
              session.user.role = userData.role;
              session.user.membershipStatus = userData.membershipStatus;
              (session.user as any).viewMode = userData.viewMode || "MEMBER";
              (session.user as any).isPPOHead = userData.isPPOHead || false;
              (session.user as any).ppoHeadOrganizationId = userData.ppoHeadOrganizationId || null;
            }
          } catch (error) {
            console.error("[Auth] Error fetching user data from DB:", error);
            (session.user as any).viewMode = "MEMBER";
            (session.user as any).isPPOHead = false;
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