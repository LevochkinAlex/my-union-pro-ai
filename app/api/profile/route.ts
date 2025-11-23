import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { capitalizeName } from "@/lib/utils/nameFormatting";
import { EDUCATION_LEVELS } from "@/lib/constants/education";
import { syncUserToBestBenefits } from "@/lib/best-benefits-users";
import { decryptPassword } from "@/lib/best-benefits-password";
import crypto from "crypto";

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function normalizeEducation(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const matched = EDUCATION_LEVELS.find(
    (level) => level.toLowerCase() === normalized.toLowerCase(),
  );
  return matched ?? normalized;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            inn: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        jobTitle: user.jobTitle,
        profession: user.profession,
        education: user.education,
        occupation: user.occupation,
        hobbies: user.hobbies,
        aboutMe: user.aboutMe,
        hasChildren: user.hasChildren,
        childrenInfo: user.childrenInfo,
        maritalStatus: user.maritalStatus,
        spouseInfo: user.spouseInfo,
        additionalInfo: user.additionalInfo,
        membershipStatus: user.membershipStatus,
        organization: user.organization,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("[profile] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить профиль" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();

    const firstName = normalizeString(body.firstName);
    const lastName = normalizeString(body.lastName);
    const middleName = normalizeString(body.middleName);
    const phone = normalizeString(body.phone);
    const address = normalizeString(body.address);
    const jobTitle = normalizeString(body.jobTitle);
    const profession = normalizeString(body.profession);
    const education = normalizeEducation(body.education);

    let dateOfBirth: Date | null = null;
    if (body.dateOfBirth) {
      const date = new Date(body.dateOfBirth);
      if (!Number.isNaN(date.getTime())) {
        dateOfBirth = date;
      }
    }

    // Получаем пользователя с bestBenefitsPassword перед обновлением
    const userBeforeUpdate = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        firstName: firstName ? capitalizeName(firstName) : null,
        lastName: lastName ? capitalizeName(lastName) : null,
        middleName: middleName ? capitalizeName(middleName) : null,
        phone,
        address,
        jobTitle,
        profession,
        education,
        dateOfBirth,
      },
    });

    // Синхронизация с BestBenefits при первом заполнении ФИО
    if (
      process.env.USE_REAL_BB_API === "true" &&
      firstName &&
      lastName &&
      !userBeforeUpdate?.bestBenefitsUserId // Ещё не синхронизирован
    ) {
      console.log("[profile] User filled profile with name, syncing to BestBenefits...");
      
      // Используем сохраненный пароль из БД (тот же, что и в нашей системе)
      let bbPassword: string;
      
      if (userBeforeUpdate?.bestBenefitsPassword) {
        try {
          // Расшифровываем сохраненный пароль
          bbPassword = decryptPassword(userBeforeUpdate.bestBenefitsPassword);
          console.log("[profile] Using saved password from database for BestBenefits");
        } catch (error) {
          console.error("[profile] Failed to decrypt password, generating new one:", error);
          // Если не удалось расшифровать, генерируем новый (fallback)
          bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
        }
      } else {
        // Если пароля нет в БД, генерируем новый (для старых пользователей)
        console.log("[profile] No saved password found, generating new one");
        bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
      }
      
      syncUserToBestBenefits({
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        password: bbPassword,
        city_id: null,
      })
        .then(async (bbData) => {
          await prisma.user.update({
            where: { id: updatedUser.id },
            data: {
              bestBenefitsUserId: bbData.bestBenefitsUserId,
              bestBenefitsStatus: bbData.status,
              bestBenefitsCreatedAt: new Date(),
            },
          });
          console.log(
            `[profile] User ${updatedUser.id} synced to BestBenefits:`,
            bbData.bestBenefitsUserId
          );
        })
        .catch((error) => {
          console.error(
            `[profile] Failed to sync user ${updatedUser.id} to BestBenefits:`,
            error
          );
        });
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error("[profile] PUT error:", error);
    return NextResponse.json(
      { error: "Не удалось обновить профиль" },
      { status: 500 },
    );
  }
}
