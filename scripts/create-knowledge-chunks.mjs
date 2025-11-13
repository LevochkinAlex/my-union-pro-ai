import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });

const prisma = new PrismaClient();

// Функция для разбиения текста на chunks
function splitTextIntoChunks(text, chunkSize = 500, overlap = 100) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.substring(start, end);
    chunks.push(chunk.trim());
    start = end - overlap;
  }
  
  return chunks.filter(c => c.length > 50);
}

// Функция для получения embeddings от OpenRouter
async function getEmbedding(text) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY не установлен');
    return null;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ошибка API:', errorText);
      return null;
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Ошибка получения embedding:', error);
    return null;
  }
}

async function main() {
  try {
    console.log('🔄 Начинаю создание chunks...\n');
    
    const docs = await prisma.knowledgeDocument.findMany({
      where: {
        knowledgeBaseId: 'cmhw6mwem0000p1j6qmjt3c59',
        processingStatus: 'COMPLETED',
      },
    });

    console.log(`📄 Найдено ${docs.length} обработанных документов\n`);

    for (const doc of docs) {
      console.log(`Обрабатываю: ${doc.fileName || doc.originalName}`);
      
      if (!doc.extractedText) {
        console.log('  ⏭️  Пропускаю - нет текста\n');
        continue;
      }

      // Разбиваем на chunks (меньший размер)
      const textChunks = splitTextIntoChunks(doc.extractedText, 300, 50);
      console.log(`  📑 Создано ${textChunks.length} фрагментов`);
      
      // Для коротких документов - создаем один chunk
      if (doc.extractedText.length < 600) {
        console.log(`  📝 Документ короткий, создаю один chunk`);
        const embedding = await getEmbedding(doc.extractedText);
        if (embedding) {
          await prisma.knowledgeChunk.create({
            data: {
              knowledgeBaseId: doc.knowledgeBaseId,
              documentId: doc.id,
              content: doc.extractedText,
              embedding: embedding,
              chunkIndex: 0,
              metadata: {
                fileName: doc.fileName || doc.originalName,
              },
            },
          });
          console.log(`  ✅ Документ сохранен как один chunk\n`);
        }
        continue;
      }

      // Создаем chunks в БД с embeddings
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        console.log(`  🔄 Chunk ${i + 1}/${textChunks.length}...`);
        
        // Получаем embedding
        const embedding = await getEmbedding(chunk);
        if (!embedding) {
          console.log(`  ❌ Не удалось получить embedding`);
          continue;
        }

        // Сохраняем chunk
        await prisma.knowledgeChunk.create({
          data: {
            knowledgeBaseId: doc.knowledgeBaseId,
            documentId: doc.id,
            content: chunk,
            embedding: embedding,
            chunkIndex: i,
            metadata: {
              fileName: doc.fileName || doc.originalName,
            },
          },
        });
        
        console.log(`  ✅ Chunk ${i + 1} сохранен`);
      }
      
      console.log(`  ✅ Документ обработан\n`);
    }

    const totalChunks = await prisma.knowledgeChunk.count({
      where: { knowledgeBaseId: 'cmhw6mwem0000p1j6qmjt3c59' },
    });

    console.log(`\n🎉 Готово! Всего создано ${totalChunks} chunks`);
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

