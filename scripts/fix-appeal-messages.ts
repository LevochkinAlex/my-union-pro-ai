/**
 * Скрипт для исправления старых начальных сообщений обращений
 * - Удаляет HTML теги из content
 * - Исправляет [object Object]
 * - Улучшает форматирование
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Очищает HTML теги из текста
 */
function stripHtml(html: string): string {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, '') // Удаляем все HTML теги
    .replace(/&nbsp;/g, ' ') // Заменяем &nbsp; на пробел
    .replace(/&amp;/g, '&') // Заменяем &amp; на &
    .replace(/&lt;/g, '<') // Заменяем &lt; на <
    .replace(/&gt;/g, '>') // Заменяем &gt; на >
    .replace(/&quot;/g, '"') // Заменяем &quot; на "
    .replace(/&#39;/g, "'") // Заменяем &#39; на '
    .replace(/&#x27;/g, "'") // Заменяем &#x27; на '
    .replace(/&#x2F;/g, '/') // Заменяем &#x2F; на /
    .replace(/\s+/g, ' ') // Убираем множественные пробелы
    .trim();
}

/**
 * Нормализует content сообщения
 */
function normalizeContent(content: any): string {
  if (!content) return '';
  
  // Если это строка - очищаем HTML
  if (typeof content === 'string') {
    return stripHtml(content);
  }
  
  // Если это объект - пытаемся извлечь текст
  if (typeof content === 'object') {
    const text = (content as any).text || 
                 (content as any).content || 
                 (content as any).body ||
                 JSON.stringify(content);
    return stripHtml(String(text));
  }
  
  return stripHtml(String(content));
}

/**
 * Улучшает форматирование начального сообщения обращения
 */
function improveAppealMessageFormat(content: string): string {
  // Если сообщение уже в правильном формате - не трогаем
  if (content.includes('**Обращение #') && content.includes('**Тема:**')) {
    return content;
  }
  
  // Пытаемся извлечь информацию из старого формата
  const appealMatch = content.match(/Обращение\s*#?(\d+)/i);
  const titleMatch = content.match(/(?:Тема|Заголовок)[:：]?\s*(.+?)(?:\n|$)/i);
  const contentMatch = content.match(/(?:Текст|Содержание|Сообщение)[:：]?\s*(.+?)(?:\n\n|$)/is);
  
  let improved = '';
  
  if (appealMatch) {
    improved += `**Обращение #${appealMatch[1]}**\n\n`;
  }
  
  if (titleMatch) {
    improved += `**Тема:** ${stripHtml(titleMatch[1])}\n\n`;
  }
  
  if (contentMatch) {
    improved += `**Текст обращения:**\n${stripHtml(contentMatch[1])}\n\n`;
  } else {
    // Если не нашли структуру, просто очищаем HTML
    improved = stripHtml(content);
  }
  
  return improved;
}

async function main() {
  console.log('🚀 Начинаем исправление старых сообщений обращений...\n');
  
  try {
    // Находим все чаты обращений
    const appealChats = await prisma.chat.findMany({
      where: {
        type: 'GROUP',
        name: {
          startsWith: 'Обращение #',
        },
      },
      include: {
        messages: {
          where: {
            messageType: 'text',
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 1, // Берем только первое сообщение (начальное)
        },
      },
    });
    
    console.log(`📋 Найдено ${appealChats.length} чатов обращений\n`);
    
    let fixed = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const chat of appealChats) {
      if (chat.messages.length === 0) {
        skipped++;
        continue;
      }
      
      const message = chat.messages[0];
      const originalContent = message.content;
      
      // Нормализуем content
      let normalizedContent = normalizeContent(originalContent);
      
      // Улучшаем форматирование
      normalizedContent = improveAppealMessageFormat(normalizedContent);
      
      // Проверяем, нужно ли обновлять
      if (normalizedContent === originalContent) {
        skipped++;
        continue;
      }
      
      try {
        await prisma.chatMessage.update({
          where: { id: message.id },
          data: { content: normalizedContent },
        });
        
        fixed++;
        console.log(`✅ Исправлено сообщение ${message.id} в чате ${chat.id}`);
        console.log(`   Было: ${originalContent.substring(0, 100)}...`);
        console.log(`   Стало: ${normalizedContent.substring(0, 100)}...\n`);
      } catch (error: any) {
        errors++;
        console.error(`❌ Ошибка при обновлении сообщения ${message.id}:`, error.message);
      }
    }
    
    console.log('\n📊 Результаты:');
    console.log(`   ✅ Исправлено: ${fixed}`);
    console.log(`   ⏭️  Пропущено: ${skipped}`);
    console.log(`   ❌ Ошибок: ${errors}`);
    console.log(`   📝 Всего обработано: ${appealChats.length}\n`);
    
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
