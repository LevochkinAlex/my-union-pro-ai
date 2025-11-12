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

  // Объединяем все сообщения пользователя в один текст для анализа
  const userMessages = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join(" ");

  // Простое извлечение данных с помощью регулярных выражений
  // ФИО (пример: "Иванов Иван Иванович")
  const fioMatch = userMessages.match(
    /(?:фио|ф\.?и\.?о\.?|фамилия|имя|отчество)[\s:]*([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,2})/i
  );
  if (fioMatch) {
    const parts = fioMatch[1].trim().split(/\s+/);
    if (parts.length >= 2) {
      profileData.lastName = parts[0];
      profileData.firstName = parts[1];
      if (parts.length >= 3) {
        profileData.middleName = parts[2];
      }
    }
  }

  // Дата рождения (формат ДД.ММ.ГГГГ)
  const dateMatch = userMessages.match(
    /(?:дата\s+рождения|родился|родилась)[\s:]*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})/i
  );
  if (dateMatch) {
    const dateStr = dateMatch[1].replace(/[-/]/g, ".");
    const [day, month, year] = dateStr.split(".");
    if (day && month && year) {
      profileData.dateOfBirth = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day)
      );
    }
  }

  // Телефон
  const phoneMatch = userMessages.match(
    /(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g
  );
  if (phoneMatch) {
    profileData.phone = phoneMatch[0].replace(/\D/g, "");
    if (!profileData.phone.startsWith("7")) {
      profileData.phone = "7" + profileData.phone;
    }
    profileData.phone = "+" + profileData.phone;
  }

  // Адрес (ищем после ключевых слов)
  const addressMatch = userMessages.match(
    /(?:адрес|проживаю|живу)[\s:]*([А-ЯЁа-яё0-9\s,.\-]+(?:улица|ул\.|проспект|пр\.|дом|д\.|квартира|кв\.|город|г\.|область|обл\.)[А-ЯЁа-яё0-9\s,.\-]*)/i
  );
  if (addressMatch) {
    profileData.address = addressMatch[1].trim();
  }

  // Должность
  const jobTitleMatch = userMessages.match(
    /(?:должность|работаю|занимаю)[\s:]*([А-ЯЁа-яё\s]+)/i
  );
  if (jobTitleMatch && jobTitleMatch[1].length < 100) {
    profileData.jobTitle = jobTitleMatch[1].trim();
  }

  // Профессия
  const professionMatch = userMessages.match(
    /(?:профессия|специальность)[\s:]*([А-ЯЁа-яё\s]+)/i
  );
  if (professionMatch && professionMatch[1].length < 100) {
    profileData.profession = professionMatch[1].trim();
  }

  // Образование
  const educationMatch = userMessages.match(
    /(?:образование)[\s:]*([А-ЯЁа-яё\s]+(?:среднее|высшее|специальное))/i
  );
  if (educationMatch) {
    profileData.education = educationMatch[1].trim();
  }

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
      
      // Генерируем оба заявления
      const [membershipPath, contributionsPath] = await Promise.all([
        generateMembershipApplication(updatedUser, ppoChairman),
        generateContributionsApplication(updatedUser, ppoChairman),
      ]);

      // Сохраняем документы в базе данных
      await Promise.all([
        prisma.document.create({
          data: {
            type: "MEMBERSHIP_APPLICATION",
            status: "DRAFT",
            title: "Заявление о вступлении в профсоюз",
            filePath: membershipPath,
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
            userId: updatedUser.id,
            organizationId: updatedUser.organizationId || null,
          },
        }),
      ]);
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

