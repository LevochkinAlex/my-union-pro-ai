import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        occupation: true,
        hobbies: true,
        aboutMe: true,
        hasChildren: true,
        childrenInfo: true,
        maritalStatus: true,
        spouseInfo: true,
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

    const body = await request.json();

    const occupation = normalizeString(body.occupation);
    const hobbies = normalizeString(body.hobbies);
    const aboutMe = normalizeString(body.aboutMe);
    const hasChildren = normalizeBoolean(body.hasChildren);
    const childrenInfo = normalizeString(body.childrenInfo);
    const maritalStatus = normalizeString(body.maritalStatus);
    const spouseInfo = normalizeString(body.spouseInfo);
    const additionalInfo = normalizeString(body.additionalInfo);

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        occupation,
        hobbies,
        aboutMe,
        hasChildren,
        childrenInfo,
        maritalStatus,
        spouseInfo,
        additionalInfo,
      },
      select: {
        occupation: true,
        hobbies: true,
        aboutMe: true,
        hasChildren: true,
        childrenInfo: true,
        maritalStatus: true,
        spouseInfo: true,
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

