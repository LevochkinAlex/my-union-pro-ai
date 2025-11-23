import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * API для обновления отдельных полей профиля во время чата
 * Используется когда пользователь исправляет данные
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { field, value } = body;

    if (!field || value === undefined) {
      return NextResponse.json(
        { error: "Не указано поле или значение" },
        { status: 400 }
      );
    }

    // Список разрешенных полей для обновления
    const allowedFields = [
      'firstName',
      'lastName',
      'middleName',
      'dateOfBirth',
      'phone',
      'address',
      'region',
      'jobTitle',
      'profession',
      'education',
      'organizationName'
    ];

    if (!allowedFields.includes(field)) {
      return NextResponse.json(
        { error: `Поле ${field} не может быть обновлено` },
        { status: 400 }
      );
    }

    // Валидация значения в зависимости от поля
    let validatedValue = value;

    if (field === 'dateOfBirth') {
      // Парсим дату
      if (typeof value === 'string') {
        const datePattern = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/;
        const match = value.match(datePattern);
        if (match) {
          const [, day, month, year] = match;
          validatedValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
          validatedValue = new Date(value);
        }
        
        if (isNaN(validatedValue.getTime())) {
          return NextResponse.json(
            { error: "Некорректный формат даты" },
            { status: 400 }
          );
        }
      }
    }

    // Обновляем поле
    const updateData: any = {};
    updateData[field] = validatedValue;

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
    });

    console.log(`[update-profile-field] Updated ${field} for user ${session.user.id}`);

    return NextResponse.json({
      success: true,
      field,
      value: validatedValue,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        middleName: updatedUser.middleName,
        dateOfBirth: updatedUser.dateOfBirth,
        phone: updatedUser.phone,
        address: updatedUser.address,
        region: updatedUser.region,
        jobTitle: updatedUser.jobTitle,
        profession: updatedUser.profession,
        education: updatedUser.education,
      }
    });
  } catch (error) {
    console.error("[update-profile-field] Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

