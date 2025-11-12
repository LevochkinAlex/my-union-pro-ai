import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  try {
    console.log('Выполнение миграции: добавление chatBotId в ChatMessage...');
    
    // Выполняем SQL напрямую
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "chatBotId" TEXT;
    `);
    
    console.log('✓ Колонка chatBotId добавлена');
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ChatMessage_chatBotId_idx" ON "ChatMessage"("chatBotId");
    `);
    
    console.log('✓ Индекс создан');
    
    // Проверяем, существует ли уже внешний ключ
    const existingConstraint = await prisma.$queryRawUnsafe(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'ChatMessage' 
      AND constraint_name = 'ChatMessage_chatBotId_fkey'
      AND constraint_type = 'FOREIGN KEY';
    `);
    
    if (existingConstraint.length === 0) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ChatMessage" 
        ADD CONSTRAINT "ChatMessage_chatBotId_fkey" 
        FOREIGN KEY ("chatBotId") REFERENCES "ChatBot"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
      `);
      console.log('✓ Внешний ключ создан');
    } else {
      console.log('✓ Внешний ключ уже существует');
    }
    
    console.log('\n✅ Миграция успешно завершена!');
  } catch (error) {
    console.error('❌ Ошибка при миграции:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrate();

