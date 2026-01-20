import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

async function fixChatTables() {
  try {
    console.log('🚀 Исправляем структуру таблиц чатов...\n');

    // 1. Добавляем недостающие колонки в ChatMessage
    console.log('1️⃣ Добавляем колонки в ChatMessage...');
    try {
      await prisma.$executeRaw`ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "threadRootId" TEXT`;
      console.log('   ✅ threadRootId добавлена');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  threadRootId:', e.message);
    }

    try {
      await prisma.$executeRaw`ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "messageType" TEXT DEFAULT 'text'`;
      await prisma.$executeRaw`ALTER TABLE "ChatMessage" ALTER COLUMN "messageType" SET DEFAULT 'text'`;
      console.log('   ✅ messageType добавлена');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  messageType:', e.message);
    }

    try {
      await prisma.$executeRaw`ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "threadRepliesCount" INTEGER DEFAULT 0`;
      await prisma.$executeRaw`ALTER TABLE "ChatMessage" ALTER COLUMN "threadRepliesCount" SET DEFAULT 0`;
      console.log('   ✅ threadRepliesCount добавлена');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  threadRepliesCount:', e.message);
    }

    try {
      await prisma.$executeRaw`ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "threadLastReplyAt" TIMESTAMP(3)`;
      console.log('   ✅ threadLastReplyAt добавлена');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  threadLastReplyAt:', e.message);
    }

    // 2. Создаем остальные таблицы
    console.log('\n2️⃣ Создаем таблицы...');
    
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ChatMessageAttachment" (
          "id" TEXT NOT NULL,
          "messageId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "url" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "size" INTEGER,
          "mimeType" TEXT,
          "thumbnailUrl" TEXT,
          "width" INTEGER,
          "height" INTEGER,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("id")
        )
      `;
      console.log('   ✅ ChatMessageAttachment создана');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  ChatMessageAttachment:', e.message);
    }

    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ChatMessageReaction" (
          "id" TEXT NOT NULL,
          "messageId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "emoji" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
        )
      `;
      console.log('   ✅ ChatMessageReaction создана');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  ChatMessageReaction:', e.message);
    }

    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ChatMessageRead" (
          "id" TEXT NOT NULL,
          "messageId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ChatMessageRead_pkey" PRIMARY KEY ("id")
        )
      `;
      console.log('   ✅ ChatMessageRead создана');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  ChatMessageRead:', e.message);
    }

    // 3. Создаем индексы
    console.log('\n3️⃣ Создаем индексы...');
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "ChatMessage_chatId_threadRootId_createdAt_idx" ON "ChatMessage"("chatId", "threadRootId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "ChatMessage_threadRootId_idx" ON "ChatMessage"("threadRootId")`,
      `CREATE INDEX IF NOT EXISTS "ChatMessageAttachment_messageId_idx" ON "ChatMessageAttachment"("messageId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessageReaction_messageId_userId_emoji_key" ON "ChatMessageReaction"("messageId", "userId", "emoji")`,
      `CREATE INDEX IF NOT EXISTS "ChatMessageReaction_messageId_idx" ON "ChatMessageReaction"("messageId")`,
      `CREATE INDEX IF NOT EXISTS "ChatMessageReaction_userId_idx" ON "ChatMessageReaction"("userId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessageRead_messageId_userId_key" ON "ChatMessageRead"("messageId", "userId")`,
      `CREATE INDEX IF NOT EXISTS "ChatMessageRead_messageId_idx" ON "ChatMessageRead"("messageId")`,
      `CREATE INDEX IF NOT EXISTS "ChatMessageRead_userId_idx" ON "ChatMessageRead"("userId")`,
    ];

    for (const indexSql of indexes) {
      try {
        await prisma.$executeRawUnsafe(indexSql);
        console.log(`   ✅ Индекс создан`);
      } catch (e) {
        if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
          console.log(`   ⚠️  Ошибка индекса:`, e.message.substring(0, 100));
        }
      }
    }

    // 4. Добавляем колонки в Chat (если их нет)
    console.log('\n4️⃣ Добавляем колонки в Chat...');
    try {
      await prisma.$executeRaw`ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "lastMessageId" TEXT`;
      console.log('   ✅ lastMessageId добавлена');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  lastMessageId:', e.message);
    }

    try {
      await prisma.$executeRaw`ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3)`;
      console.log('   ✅ lastMessageAt добавлена');
    } catch (e) {
      if (!e.message.includes('already exists')) console.log('   ⚠️  lastMessageAt:', e.message);
    }

    console.log('\n✅ Структура таблиц исправлена!');
    console.log('💡 Теперь можно запустить скрипт reset-ai-chats-to-welcome.mjs');

  } catch (error) {
    console.error('❌ Ошибка:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixChatTables()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
