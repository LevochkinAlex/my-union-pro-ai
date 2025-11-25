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
    
    // Обновляем до 8000 (оптимально для Claude 3.5 Sonnet и GPT-4)
    const newMaxTokens = 8000;
    
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
  console.log('   - Удерживать в памяти все инструкции');
  console.log('   - Не забывать про сбор данных о каждом ребенке');
  console.log('   - Лучше следовать сложным правилам');
  
  await prisma.$disconnect();
}

updateBotTokens().catch((error) => {
  console.error('❌ Ошибка:', error);
  process.exit(1);
});

