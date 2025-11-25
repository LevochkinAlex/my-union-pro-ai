import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateBotTokens() {
  console.log('🔧 Обновляем maxTokens для всех ботов...');
  
  // Получаем всех ботов
  const bots = await prisma.chatBot.findMany({
    select: {
      id: true,
      name: true,
      model: true,
      maxTokens: true
    }
  });

  console.log(`\n📊 Найдено ботов: ${bots.length}\n`);

  for (const bot of bots) {
    console.log(`Bot: ${bot.name}`);
    console.log(`  Модель: ${bot.model}`);
    console.log(`  Было: ${bot.maxTokens} tokens`);
    
    // Обновляем до 16000 (оптимально для GPT-4o-mini с context window 128K)
    // Это позволит боту давать развернутые ответы и не терять инструкции
    const newMaxTokens = 16000;
    
    await prisma.chatBot.update({
      where: { id: bot.id },
      data: { maxTokens: newMaxTokens }
    });
    
    console.log(`  ✅ Стало: ${newMaxTokens} tokens`);
    console.log('');
  }

  console.log('✨ Все боты обновлены!');
  console.log('');
  console.log('💡 Теперь бот сможет:');
  console.log('   - Давать более развернутые и подробные ответы');
  console.log('   - Не обрывать длинные объяснения на середине');
  console.log('   - Лучше следовать сложным многоступенчатым инструкциям');
  
  await prisma.$disconnect();
}

updateBotTokens().catch((error) => {
  console.error('❌ Ошибка:', error);
  process.exit(1);
});

