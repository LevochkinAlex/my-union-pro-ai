import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { getDemoProfileAdditionalInfo } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === "boolean") {
    return value;
  }
  
  const str = String(value).toLowerCase();
  if (str === "true" || str === "1" || str === "yes") {
    return true;
  }
  if (str === "false" || str === "0" || str === "no") {
    return false;
  }
  
  return null;
}

/**
 * GET /api/profile/additional-info
 * Получение дополнительной информации профиля
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const isDemo = session.user.id === DEMO_USER_ID || session.user.id === DEMO_MEMBER_USER_ID;
    if (isDemo) {
      return NextResponse.json(getDemoProfileAdditionalInfo(session.user.id));
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        employmentStatus: true,
        hobbies: true,
        aboutMe: true,
        hasChildren: true,
        childrenInfo: true,
        childrenBirthDates: true,
        maritalStatus: true,
        spouseInfo: true,
        awards: true,
        training: true,
        professions: true,
        educations: true,
        profession: true,
        education: true,
        additionalInfo: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("[additional-info] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить дополнительную информацию" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/profile/additional-info
 * Обновление дополнительной информации профиля
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const isDemo = session.user.id === DEMO_USER_ID || session.user.id === DEMO_MEMBER_USER_ID;
    if (isDemo) {
      const data = getDemoProfileAdditionalInfo(session.user.id);
      return NextResponse.json({ success: true, data });
    }

    const body = await request.json();

    // Валидация возраста детей (до 18 лет включительно)
    if (body.childrenBirthDates) {
      try {
        const children = JSON.parse(body.childrenBirthDates);
        if (Array.isArray(children)) {
          const today = new Date();
          for (const child of children) {
            if (child.birthDate) {
              const birthDate = new Date(child.birthDate);
              if (isNaN(birthDate.getTime())) {
                return NextResponse.json(
                  { error: `Неверный формат даты рождения для ребенка: ${child.name || "неизвестно"}` },
                  { status: 400 }
                );
              }
              
              let age = today.getFullYear() - birthDate.getFullYear();
              const monthDiff = today.getMonth() - birthDate.getMonth();
              if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
              }
              
              if (age > 18) {
                return NextResponse.json(
                  { error: `Возраст ребенка "${child.name || "неизвестно"}" не может быть больше 18 лет. Текущий возраст: ${age} лет` },
                  { status: 400 }
                );
              }
            }
          }
        }
      } catch (error) {
        // Если не удалось распарсить JSON, пропускаем проверку (может быть пустая строка)
        if (body.childrenBirthDates.trim() !== "") {
          console.error("[additional-info] Failed to parse childrenBirthDates:", error);
        }
      }
    }

    // Загружаем текущие значения, чтобы не затирать награды и доп. информацию при пустом теле запроса
    // (пользователь мог заполнить их во вкладке Профиль, а потом дозаполнить анкету)
    const existing = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        awards: true,
        additionalInfo: true,
        hobbies: true,
        aboutMe: true,
        training: true,
        professions: true,
        educations: true,
      },
    });

    const employmentStatus = normalizeString(body.employmentStatus);
    const hobbies = normalizeString(body.hobbies);
    const aboutMe = normalizeString(body.aboutMe);
    const hasChildren = normalizeBoolean(body.hasChildren);
    const childrenInfo = normalizeString(body.childrenInfo);
    const childrenBirthDates = normalizeString(body.childrenBirthDates);
    const maritalStatus = normalizeString(body.maritalStatus);
    const spouseInfo = normalizeString(body.spouseInfo);
    const awardsRaw = normalizeString(body.awards);
    const trainingRaw = normalizeString(body.training);
    const professionsRaw = normalizeString(body.professions);
    const educationsRaw = normalizeString(body.educations);
    const additionalInfoRaw = normalizeString(body.additionalInfo);

    // Не затираем награды и доп. информацию пустыми значениями — сохраняем существующие
    const awards = (awardsRaw !== null && awardsRaw !== "") ? awardsRaw : (existing?.awards ?? null);
    const additionalInfo = (additionalInfoRaw !== null && additionalInfoRaw !== "") ? additionalInfoRaw : (existing?.additionalInfo ?? null);
    const training = (trainingRaw !== null && trainingRaw !== "") ? trainingRaw : (existing?.training ?? null);
    const professions = (professionsRaw !== null && professionsRaw !== "") ? professionsRaw : (existing?.professions ?? null);
    const educations = (educationsRaw !== null && educationsRaw !== "") ? educationsRaw : (existing?.educations ?? null);
    const hobbiesFinal = (hobbies !== null && hobbies !== "") ? hobbies : (existing?.hobbies ?? null);
    const aboutMeFinal = (aboutMe !== null && aboutMe !== "") ? aboutMe : (existing?.aboutMe ?? null);

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        employmentStatus,
        hobbies: hobbiesFinal,
        aboutMe: aboutMeFinal,
        hasChildren,
        childrenInfo,
        childrenBirthDates,
        maritalStatus,
        spouseInfo,
        awards,
        training,
        professions,
        educations,
        additionalInfo,
      },
      select: {
        employmentStatus: true,
        hobbies: true,
        aboutMe: true,
        hasChildren: true,
        childrenInfo: true,
        childrenBirthDates: true,
        maritalStatus: true,
        spouseInfo: true,
        awards: true,
        training: true,
        professions: true,
        educations: true,
        additionalInfo: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    console.error("[additional-info] PUT error:", error);
    return NextResponse.json(
      { error: "Не удалось обновить дополнительную информацию" },
      { status: 500 },
    );
  }
}

