import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

async function applyChatTables() {
  try {
    console.log('🚀 Применяем SQL скрипт для создания таблиц чатов...\n');

    const sql = readFileSync(resolve(process.cwd(), 'scripts/create-chat-tables-manually.sql'), 'utf-8');
    
    // Разбиваем SQL на отдельные команды
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    for (const command of commands) {
      if (command.trim().length === 0) continue;
      
      try {
        await prisma.$executeRawUnsafe(command);
        console.log(`   ✅ Выполнено: ${command.substring(0, 50)}...`);
      } catch (error) {
        // Игнорируем ошибки "уже существует"
        if (error.message.includes('already exists') || 
            error.message.includes('duplicate') ||
            error.message.includes('constraint') && error.message.includes('already')) {
          console.log(`   ⏭️  Пропущено (уже существует): ${command.substring(0, 50)}...`);
        } else {
          console.error(`   ❌ Ошибка: ${error.message}`);
          console.error(`   Команда: ${command.substring(0, 100)}...`);
        }
      }
    }

    console.log('\n✅ SQL скрипт применен!');
    
    // Проверяем, что таблицы созданы
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('ChatMessage', 'ChatMessageAttachment', 'ChatMessageReaction', 'ChatMessageRead')
    `;
    
    console.log('\n📋 Созданные таблицы:');
    tables.forEach(t => console.log(`   ✅ ${t.table_name}`));

  } catch (error) {
    console.error('❌ Ошибка:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyChatTables()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
