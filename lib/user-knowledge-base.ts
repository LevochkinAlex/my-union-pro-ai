/**
 * База знаний о пользователе для ИИ
 * Автоматически сохраняет информацию о пользователе для восстановления и использования ИИ
 */

import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import { User, Organization } from "@prisma/client";

interface UserWithOrganization extends User {
  organization?: Organization | null;
}

/**
 * Получает или создает базу знаний для пользователя
 */
export async function getOrCreateUserKnowledgeBase(userId: string) {
  let userKB = await prisma.userKnowledgeBase.findUnique({
    where: { userId },
  });

  if (!userKB) {
    userKB = await prisma.userKnowledgeBase.create({
      data: { userId },
    });
  }

  return userKB;
}

/**
 * Сохраняет данные профиля пользователя в базу знаний
 */
export async function saveUserProfileToKnowledgeBase(
  user: UserWithOrganization
) {
  try {
    const userKB = await getOrCreateUserKnowledgeBase(user.id);

    // Формируем текстовое представление профиля
    const profileData: string[] = [];

    if (user.firstName || user.lastName || user.middleName) {
      const fullName = [
        user.lastName,
        user.firstName,
        user.middleName,
      ]
        .filter(Boolean)
        .join(" ");
      profileData.push(`ФИО: ${fullName}`);
    }

    if (user.email) {
      profileData.push(`Email: ${user.email}`);
    }

    if (user.phone) {
      profileData.push(`Телефон: ${user.phone}`);
    }

    if (user.dateOfBirth) {
      profileData.push(
        `Дата рождения: ${new Date(user.dateOfBirth).toLocaleDateString("ru-RU")}`
      );
    }

    if (user.address) {
      profileData.push(`Адрес: ${user.address}`);
    }

    if (user.jobTitle) {
      profileData.push(`Должность: ${user.jobTitle}`);
    }

    if (user.profession) {
      profileData.push(`Профессия: ${user.profession}`);
    }

    if (user.education) {
      profileData.push(`Образование: ${user.education}`);
    }

    if (user.organization) {
      profileData.push(`Организация: ${user.organization.name}`);
      if (user.organization.inn) {
        profileData.push(`ИНН организации: ${user.organization.inn}`);
      }
    }

    if (user.employmentStatus) {
      profileData.push(`Статус занятости: ${user.employmentStatus}`);
    }

    if (user.hobbies) {
      profileData.push(`Хобби: ${user.hobbies}`);
    }

    if (user.aboutMe) {
      profileData.push(`О себе: ${user.aboutMe}`);
    }

    if (user.hasChildren !== null) {
      profileData.push(
        `Дети: ${user.hasChildren ? "есть" : "нет"}${user.childrenInfo ? ` - ${user.childrenInfo}` : ""}`
      );
    }

    if (user.maritalStatus) {
      profileData.push(
        `Семейное положение: ${user.maritalStatus}${user.spouseInfo ? ` - ${user.spouseInfo}` : ""}`
      );
    }

    if (user.additionalInfo) {
      profileData.push(`Дополнительная информация: ${user.additionalInfo}`);
    }

    const content = profileData.join("\n");

    if (!content.trim()) {
      console.log("[user-knowledge-base] Нет данных профиля для сохранения");
      return;
    }

    // Генерируем embedding
    const embedding = await generateEmbedding(content);
    if (!embedding || embedding.length === 0) {
      console.warn("[user-knowledge-base] Не удалось сгенерировать embedding");
      return;
    }

    // Удаляем старые chunks с данными профиля
    await prisma.userKnowledgeChunk.deleteMany({
      where: {
        userKnowledgeBaseId: userKB.id,
        type: "PROFILE_DATA",
      },
    });

    // Сохраняем новый chunk
    await prisma.userKnowledgeChunk.create({
      data: {
        userKnowledgeBaseId: userKB.id,
        type: "PROFILE_DATA",
        content,
        embedding,
        source: "profile_update",
        metadata: {
          updatedAt: new Date().toISOString(),
          hasOrganization: !!user.organization,
          hasChildren: user.hasChildren,
        },
        tokens: Math.ceil(content.length / 4), // Примерная оценка токенов
      },
    });

    console.log("[user-knowledge-base] Данные профиля сохранены в базу знаний");
  } catch (error) {
    console.error("[user-knowledge-base] Ошибка при сохранении профиля:", error);
    // Не бросаем ошибку, чтобы не блокировать обновление профиля
  }
}

/**
 * Сохраняет взаимодействие пользователя с ИИ
 */
export async function saveUserInteractionToKnowledgeBase(
  userId: string,
  userMessage: string,
  aiResponse: string,
  metadata?: Record<string, unknown>
) {
  try {
    const userKB = await getOrCreateUserKnowledgeBase(userId);

    const content = `Пользователь: ${userMessage}\nИИ: ${aiResponse}`;
    const embedding = await generateEmbedding(content);

    if (!embedding || embedding.length === 0) {
      console.warn("[user-knowledge-base] Не удалось сгенерировать embedding для взаимодействия");
      return;
    }

    await prisma.userKnowledgeChunk.create({
      data: {
        userKnowledgeBaseId: userKB.id,
        type: "INTERACTION",
        content,
        embedding,
        source: "ai_interaction",
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
        },
        tokens: Math.ceil(content.length / 4),
      },
    });

    console.log("[user-knowledge-base] Взаимодействие сохранено в базу знаний");
  } catch (error) {
    console.error("[user-knowledge-base] Ошибка при сохранении взаимодействия:", error);
  }
}

/**
 * Восстанавливает данные профиля из базы знаний
 */
export async function restoreUserProfileFromKnowledgeBase(
  userId: string
): Promise<Partial<User> | null> {
  try {
    const userKB = await prisma.userKnowledgeBase.findUnique({
      where: { userId },
      include: {
        chunks: {
          where: {
            type: "PROFILE_DATA",
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!userKB || userKB.chunks.length === 0) {
      console.log("[user-knowledge-base] Нет данных для восстановления");
      return null;
    }

    const latestChunk = userKB.chunks[0];
    const content = latestChunk.content;

    // Парсим данные из текста
    const profileData: Partial<User> = {};

    const lines = content.split("\n");
    for (const line of lines) {
      const [key, ...valueParts] = line.split(": ");
      const value = valueParts.join(": ").trim();

      switch (key) {
        case "ФИО":
          const nameParts = value.split(" ");
          if (nameParts.length >= 1) profileData.lastName = nameParts[0];
          if (nameParts.length >= 2) profileData.firstName = nameParts[1];
          if (nameParts.length >= 3) profileData.middleName = nameParts.slice(2).join(" ");
          break;
        case "Email":
          profileData.email = value;
          break;
        case "Телефон":
          profileData.phone = value;
          break;
        case "Дата рождения":
          const dateMatch = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
          if (dateMatch) {
            const [, day, month, year] = dateMatch;
            profileData.dateOfBirth = new Date(`${year}-${month}-${day}`);
          }
          break;
        case "Адрес":
          profileData.address = value;
          break;
        case "Должность":
          profileData.jobTitle = value;
          break;
        case "Профессия":
          profileData.profession = value;
          break;
        case "Образование":
          profileData.education = value;
          break;
        case "Хобби":
          profileData.hobbies = value;
          break;
        case "О себе":
          profileData.aboutMe = value;
          break;
        case "Семейное положение":
          const maritalMatch = value.match(/^([^\-]+)/);
          if (maritalMatch) {
            profileData.maritalStatus = maritalMatch[1].trim();
          }
          const spouseMatch = value.match(/\-\s*(.+)$/);
          if (spouseMatch) {
            profileData.spouseInfo = spouseMatch[1].trim();
          }
          break;
        case "Дети":
          profileData.hasChildren = value.startsWith("есть");
          const childrenMatch = value.match(/\-\s*(.+)$/);
          if (childrenMatch) {
            profileData.childrenInfo = childrenMatch[1].trim();
          }
          break;
        case "Дополнительная информация":
          profileData.additionalInfo = value;
          break;
      }
    }

    console.log("[user-knowledge-base] Данные восстановлены из базы знаний:", Object.keys(profileData));
    return profileData;
  } catch (error) {
    console.error("[user-knowledge-base] Ошибка при восстановлении данных:", error);
    return null;
  }
}

/**
 * Поиск релевантной информации о пользователе для ИИ
 */
export async function searchUserKnowledge(
  userId: string,
  query: string,
  limit: number = 5
): Promise<Array<{ content: string; type: string; similarity: number }>> {
  try {
    const userKB = await prisma.userKnowledgeBase.findUnique({
      where: { userId },
    });

    if (!userKB) {
      return [];
    }

    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return [];
    }

    // Получаем все chunks пользователя
    const chunks = await prisma.userKnowledgeChunk.findMany({
      where: {
        userKnowledgeBaseId: userKB.id,
      },
    });

    // Вычисляем косинусное сходство
    const results = chunks
      .map((chunk) => {
        if (!chunk.embedding || chunk.embedding.length === 0) {
          return null;
        }

        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        return {
          content: chunk.content,
          type: chunk.type,
          similarity,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  } catch (error) {
    console.error("[user-knowledge-base] Ошибка при поиске:", error);
    return [];
  }
}

/**
 * Вычисляет косинусное сходство между двумя векторами
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

