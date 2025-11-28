import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

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

export const authOptions: NextAuthOptions = {
  providers: [
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

          // Ищем неиспользованный PIN-код
          const pinRecord = await prisma.sMSPinCode.findFirst({
            where: {
              phone: normalizedPhone,
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
            return null;
          }

          // Проверяем PIN-код
          const isPinValid = await bcrypt.compare(credentials.pinCode, pinRecord.hashedPin);
          if (!isPinValid) {
            return null;
          }

          // Помечаем PIN-код как использованный
          await prisma.sMSPinCode.update({
            where: { id: pinRecord.id },
            data: {
              used: true,
              usedAt: new Date(),
            },
          });

          // Ищем или создаем пользователя
          let user = await prisma.user.findUnique({
            where: { phone: normalizedPhone },
          });

          if (!user) {
            // Создаем нового пользователя при первом успешном входе
            user = await prisma.user.create({
              data: {
                phone: normalizedPhone,
                role: "PENDING_MEMBER",
                membershipStatus: "PROFILE_INCOMPLETE",
              },
            });
            console.log("[NextAuth] ✅ Создан новый пользователь при первом входе:", {
              id: user.id,
              phone: user.phone,
            });
          } else {
            console.log("[NextAuth] ✅ Найден существующий пользователь:", {
              id: user.id,
              phone: user.phone,
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
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.membershipStatus = user.membershipStatus;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.avatarUrl = user.avatarUrl;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.membershipStatus = token.membershipStatus;
        session.user.firstName = token.firstName;
        session.user.lastName = token.lastName;
        session.user.avatarUrl = token.avatarUrl;
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
