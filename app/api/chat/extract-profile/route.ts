import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Функция для извлечения данных из истории чата
function extractProfileData(messages: Array<{ role: string; content: string }>) {
  const profileData: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    dateOfBirth?: Date;
    phone?: string;
    address?: string;
    jobTitle?: string;
    profession?: string;
    education?: string;
  } = {};

  // Объединяем ВСЕ сообщения (пользователя и AI) для анализа
  // AI часто подтверждает данные в своих ответах
  const allText = messages
    .map((msg) => msg.content)
    .join(" ");

  console.log("[extract] Анализируемый текст:", allText.substring(0, 500) + "...");

  // ФИО - ищем три слова с заглавной буквы подряд
  const fioPattern = /\*\*ФИО\*\*:\s*([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?/i;
  const fioMatch = allText.match(fioPattern) || 
                   allText.match(/([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)/);
  
  if (fioMatch) {
    // Если нашли 3 слова - это Фамилия Имя Отчество
    if (fioMatch[3]) {
      profileData.lastName = fioMatch[1].trim();
      profileData.firstName = fioMatch[2].trim();
      profileData.middleName = fioMatch[3].trim();
    } else if (fioMatch[2]) {
      // Если 2 слова - это Имя Фамилия
      profileData.firstName = fioMatch[1].trim();
      profileData.lastName = fioMatch[2].trim();
    }
    console.log("[extract] ФИО найдено:", { lastName: profileData.lastName, firstName: profileData.firstName, middleName: profileData.middleName });
  }

  // Дата рождения - ищем паттерн **Дата рождения**: или просто дату
  const datePattern = /\*\*Дата рождения\*\*:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i;
  const dateMatch = allText.match(datePattern) || allText.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
  
  if (dateMatch) {
    const dateStr = dateMatch[1].replace(/[-/]/g, ".");
    const [day, month, year] = dateStr.split(".");
    if (day && month && year) {
      profileData.dateOfBirth = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day)
      );
      console.log("[extract] Дата рождения:", profileData.dateOfBirth);
    }
  }

  // Телефон - ищем российский номер
  const phonePattern = /\*\*Телефон\*\*:\s*(\+7\s*\(\d{3}\)\s*\d{3}-\d{2}-\d{2})/i;
  const phoneMatch = allText.match(phonePattern) || allText.match(/\+7\s*\(\d{3}\)\s*\d{3}-\d{2}-\d{2}/);
  
  if (phoneMatch) {
    profileData.phone = phoneMatch[1] || phoneMatch[0];
    console.log("[extract] Телефон:", profileData.phone);
  }

  // Адрес - ищем после маркера **Адрес**:
  const addressPattern = /\*\*Адрес\*\*:\s*(.+?)(?:\n|$)/i;
  const addressMatch = allText.match(addressPattern);
  
  if (addressMatch) {
    profileData.address = addressMatch[1].trim();
    console.log("[extract] Адрес:", profileData.address);
  }

  // Должность
  const jobTitlePattern = /\*\*Должность\*\*:\s*(.+?)(?:\n|$)/i;
  const jobTitleMatch = allText.match(jobTitlePattern);
  
  if (jobTitleMatch) {
    profileData.jobTitle = jobTitleMatch[1].trim();
    console.log("[extract] Должность:", profileData.jobTitle);
  }

  // Профессия
  const professionPattern = /\*\*Профессия\*\*:\s*(.+?)(?:\n|$)/i;
  const professionMatch = allText.match(professionPattern);
  
  if (professionMatch) {
    profileData.profession = professionMatch[1].trim();
    console.log("[extract] Профессия:", profileData.profession);
  }

  // Образование - ищем после маркера и нормализуем к стандартным значениям
  const educationPattern = /\*\*Образование\*\*:\s*(.+?)(?:\n|$)/i;
  const educationMatch = allText.match(educationPattern);
  
  if (educationMatch) {
    const rawEducation = educationMatch[1].trim();
    
    // Стандартные значения образования (должны совпадать с EDUCATION_LEVELS)
    const educationStandards = [
      "Начальное общее",
      "Основное общее (9 классов)",
      "Среднее общее (11 классов)",
      "Среднее профессиональное",
      "Неполное высшее",
      "Высшее (бакалавриат)",
      "Высшее (специалитет)",
      "Высшее (магистратура)",
      "Аспирантура",
      "Докторантура",
    ];
    
    // Ищем совпадение (игнорируя регистр)
    const matchedStandard = educationStandards.find(
      std => std.toLowerCase() === rawEducation.toLowerCase()
    );
    
    profileData.education = matchedStandard || rawEducation;
    console.log("[extract] Образование:", profileData.education, matchedStandard ? "(нормализовано)" : "");
  }

  // Организация - ищем после маркера
  const organizationPattern = /\*\*Организация\*\*:\s*(.+?)(?:\n|$)/i;
  const organizationMatch = allText.match(organizationPattern);
  
  if (organizationMatch) {
    const orgName = organizationMatch[1].trim();
    console.log("[extract] Организация найдена:", orgName);
    // Организацию мы обработаем отдельно, чтобы найти или создать в БД
  }

  console.log("[extract] Финальные данные:", profileData);
  return profileData;
}

// API для извлечения и сохранения данных профиля из чата
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Получаем все сообщения пользователя
    const messages = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Проверяем, есть ли маркер завершения профиля
    const hasCompleteMarker = messages.some(
      (msg) =>
        msg.role === "assistant" &&
        msg.content.includes("[PROFILE_COMPLETE]")
    );

    if (!hasCompleteMarker) {
      return NextResponse.json(
        { error: "Профиль еще не заполнен полностью" },
        { status: 400 }
      );
    }

    // Извлекаем данные из чата
    const profileData = extractProfileData(
      messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))
    );

    console.log("[extract-profile] Извлеченные данные:", profileData);
    console.log("[extract-profile] Всего сообщений:", messages.length);

    // Обновляем профиль пользователя
    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        ...profileData,
        membershipStatus: "DOCUMENTS_PENDING", // После заполнения профиля переходим к документам
      },
      include: {
        organization: true,
      },
    });

    // Автоматически генерируем заявления после заполнения профиля
    try {
      const { generateMembershipApplication, generateContributionsApplication } = await import("@/lib/documents");
      
      const ppoChairman = updatedUser.organization?.chairmanName || "Председатель ППО";
      
      console.log("[extract-profile] Начинаем генерацию заявлений для пользователя:", updatedUser.id);
      
      // Генерируем оба заявления
      const [membershipPath, contributionsPath] = await Promise.all([
        generateMembershipApplication(updatedUser, ppoChairman),
        generateContributionsApplication(updatedUser, ppoChairman),
      ]);

      console.log("[extract-profile] Заявления сгенерированы:", { membershipPath, contributionsPath });

      // Проверяем, есть ли уже сохраненные документы, чтобы не дублировать
      const existingDocs = await prisma.document.findMany({
        where: {
          userId: updatedUser.id,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
        },
      });

      // Сохраняем документы в базе данных только если их еще нет
      if (existingDocs.length === 0) {
        await Promise.all([
          prisma.document.create({
            data: {
              type: "MEMBERSHIP_APPLICATION",
              status: "DRAFT",
              title: "Заявление о вступлении в профсоюз",
              filePath: membershipPath,
              fileName: `membership_${updatedUser.id}.pdf`,
              userId: updatedUser.id,
              organizationId: updatedUser.organizationId || null,
            },
          }),
          prisma.document.create({
            data: {
              type: "CONTRIBUTION_APPLICATION",
              status: "DRAFT",
              title: "Заявление о взносах",
              filePath: contributionsPath,
              fileName: `contributions_${updatedUser.id}.pdf`,
              userId: updatedUser.id,
              organizationId: updatedUser.organizationId || null,
            },
          }),
        ]);
        console.log("[extract-profile] Документы успешно сохранены в базу данных");
      } else {
        console.log("[extract-profile] Документы уже существуют, пропускаем создание");
      }
    } catch (error) {
      console.error("[extract-profile] Ошибка генерации заявлений:", error);
      // Не прерываем процесс, если генерация заявлений не удалась
    }

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        membershipStatus: updatedUser.membershipStatus,
      },
    });
  } catch (error) {
    console.error("Extract profile error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

