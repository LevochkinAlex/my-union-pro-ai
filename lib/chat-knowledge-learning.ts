import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import { chunkText } from "@/lib/knowledge/chunker";

/**
 * Получает или создает базу знаний для переписки с ботом
 */
export async function getOrCreateChatKnowledgeBase(botId: string) {
  const KB_NAME = `Chat Conversations - Bot ${botId}`;
  
  let knowledgeBase = await prisma.knowledgeBase.findFirst({
    where: {
      name: KB_NAME,
      isActive: true,
    },
  });

  if (!knowledgeBase) {
    knowledgeBase = await prisma.knowledgeBase.create({
      data: {
        name: KB_NAME,
        description: "База знаний, созданная из переписки пользователей с ботом",
        isActive: true,
      },
    });

    // Связываем базу знаний с ботом
    await prisma.chatBotKnowledgeBase.create({
      data: {
        chatBotId: botId,
        knowledgeBaseId: knowledgeBase.id,
      },
    });
  }

  return knowledgeBase;
}

/**
 * Сохраняет переписку с ботом в базу знаний для обучения
 */
export async function saveChatConversationToKnowledgeBase(
  botId: string,
  userMessage: string,
  botResponse: string,
  userId: string,
  chatId: string,
  messageId: string
) {
  try {
    const knowledgeBase = await getOrCreateChatKnowledgeBase(botId);

    // Формируем контекст переписки (вопрос-ответ)
    const conversationText = `Вопрос пользователя: ${userMessage}\n\nОтвет бота: ${botResponse}`;

    // Разбиваем на chunks
    const chunks = chunkText(conversationText, 1000); // Меньший размер для переписки

    // Генерируем embeddings для каждого chunk
    const chunksWithEmbeddings = await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const embedding = await generateEmbedding(chunk);
          return { content: chunk, embedding };
        } catch (error) {
          console.error("[chat-knowledge-learning] Error generating embedding:", error);
          return null;
        }
      })
    );

    // Фильтруем успешные chunks
    const validChunks = chunksWithEmbeddings.filter(
      (chunk): chunk is { content: string; embedding: number[] } => chunk !== null
    );

    if (validChunks.length === 0) {
      console.warn("[chat-knowledge-learning] No valid chunks to save");
      return;
    }

    // Создаем документ для этой переписки
    const document = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId: knowledgeBase.id,
        originalName: `chat-${chatId}-${messageId}.txt`,
        fileType: "text",
        contentType: "TEXT",
        processingStatus: "COMPLETED",
        extractedText: conversationText,
        meta: {
          chatId,
          messageId,
          userId,
          botId,
          userMessage,
          botResponse,
          createdAt: new Date().toISOString(),
        },
      },
    });

    // Сохраняем chunks с embeddings
    await prisma.knowledgeChunk.createMany({
      data: validChunks.map(({ content, embedding }) => ({
        knowledgeBaseId: knowledgeBase.id,
        documentId: document.id,
        content,
        embedding,
        tokens: Math.ceil(content.length / 4),
        metadata: {
          chatId,
          messageId,
          userId,
          source: "chat_conversation",
        },
      })),
    });

    console.log(
      `[chat-knowledge-learning] Сохранено ${validChunks.length} chunks из переписки в базу знаний`
    );
  } catch (error) {
    console.error("[chat-knowledge-learning] Ошибка при сохранении переписки:", error);
    // Не бросаем ошибку, чтобы не блокировать отправку сообщения
  }
}

