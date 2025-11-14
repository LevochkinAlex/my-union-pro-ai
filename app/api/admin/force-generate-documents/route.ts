import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";

/**
 * Force generate documents for users with complete profiles
 * Admin-only endpoint
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

    // Проверяем, что это супер-админ
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    // Получаем всех пользователей с полным профилем
    const usersWithCompleteProfile = await prisma.user.findMany({
      where: {
        AND: [
          { firstName: { not: null } },
          { lastName: { not: null } },
          { dateOfBirth: { not: null } },
          { address: { not: null } },
          { phone: { not: null } },
          { jobTitle: { not: null } },
          { profession: { not: null } },
          { education: { not: null } },
          { organization: { isNot: null } },
        ],
      },
      include: {
        organization: true,
        documents: {
          where: {
            type: {
              in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
            },
          },
        },
      },
    });

    console.log(`[force-generate] Найдено ${usersWithCompleteProfile.length} пользователей с полным профилем`);

    const results = [];

    for (const user of usersWithCompleteProfile) {
      try {
        // Пропускаем если документы уже существуют
        if (user.documents && user.documents.length >= 2) {
          console.log(`[force-generate] Пользователь ${user.id} уже имеет документы, пропускаем`);
          results.push({
            userId: user.id,
            email: user.email,
            status: "skipped",
            reason: "Documents already exist",
          });
          continue;
        }

        // Импортируем функции генерации
        const { generateMembershipApplication, generateContributionsApplication } = await import(
          "@/lib/documents"
        );

        const ppoChairman = user.organization?.chairmanName || "Председатель ППО";

        console.log(`[force-generate] Генерируем документы для ${user.id}`);

        // Генерируем оба заявления
        const [membershipPath, contributionsPath] = await Promise.all([
          generateMembershipApplication(user, ppoChairman),
          generateContributionsApplication(user, ppoChairman),
        ]);

        // Сохраняем в БД только если их нет
        if (!user.documents || user.documents.length === 0) {
          await Promise.all([
            prisma.document.create({
              data: {
                type: "MEMBERSHIP_APPLICATION",
                status: "DRAFT",
                title: "Заявление о вступлении в профсоюз",
                filePath: membershipPath,
                fileName: `membership_${user.id}.pdf`,
                userId: user.id,
                organizationId: user.organizationId,
              },
            }),
            prisma.document.create({
              data: {
                type: "CONTRIBUTION_APPLICATION",
                status: "DRAFT",
                title: "Заявление о перечислении членских взносов",
                filePath: contributionsPath,
                fileName: `contributions_${user.id}.pdf`,
                userId: user.id,
                organizationId: user.organizationId,
              },
            }),
          ]);
        }

        results.push({
          userId: user.id,
          email: user.email,
          status: "success",
          documentsGenerated: 2,
        });
      } catch (error) {
        console.error(`[force-generate] Ошибка для пользователя ${user.id}:`, error);
        results.push({
          userId: user.id,
          email: user.email,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Обработано ${usersWithCompleteProfile.length} пользователей`,
      results,
    });
  } catch (error) {
    console.error("[force-generate] Error:", error);

    // Проверяем, является ли это ошибкой доступа
    if (error instanceof Error && error.message.includes("Только супер-админ")) {
      return NextResponse.json(
        { error: "Только супер-администратор может выполнить это действие" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Ошибка при генерации документов" },
      { status: 500 }
    );
  }
}

