import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function findTalik() {
  try {
    console.log("🔍 Поиск пользователя talik...\n");

    // Ищем по email с talik
    const byEmail = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: "talik", mode: "insensitive" } },
          { firstName: { contains: "talik", mode: "insensitive" } },
          { lastName: { contains: "talik", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        _count: {
          select: {
            chatSessions: true,
            chatMessages: true,
          },
        },
      },
    });

    if (byEmail.length > 0) {
      console.log(`✅ Найдено пользователей: ${byEmail.length}\n`);
      byEmail.forEach((user, idx) => {
        console.log(`${idx + 1}. ${user.firstName} ${user.lastName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Сессий: ${user._count.chatSessions}`);
        console.log(`   Сообщений: ${user._count.chatMessages}`);
        console.log(`   Создан: ${user.createdAt}\n`);
      });
    } else {
      console.log("❌ Пользователи с 'talik' не найдены\n");
      
      // Показываем последних 10 зарегистрированных пользователей
      console.log("📋 Последние 10 зарегистрированных пользователей:\n");
      const recentUsers = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          _count: {
            select: {
              chatSessions: true,
              chatMessages: true,
            },
          },
        },
      });

      recentUsers.forEach((user, idx) => {
        console.log(`${idx + 1}. ${user.firstName || "?"} ${user.lastName || "?"}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Сессий: ${user._count.chatSessions}, Сообщений: ${user._count.chatMessages}`);
        console.log(`   Создан: ${user.createdAt}\n`);
      });
    }
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

findTalik();

